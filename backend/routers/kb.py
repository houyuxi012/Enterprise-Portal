"""
Knowledge Base Router: 文档管理 + 向量检索 API
"""
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, conint
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import PermissionChecker
from models import KBDocument, KBChunk, KBQueryLog, User
from middleware.trace_context import get_trace_id
from routers.auth import get_current_user
from fastapi import Request
from services.audit_service import AuditService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/kb", tags=["knowledge-base"])


# ──── Schemas ────

class DocumentCreateRequest(BaseModel):
    title: str
    content: str
    source_type: str = "text"  # md, pdf, text
    tags: Optional[List[str]] = None
    acl: Optional[List[str]] = None  # ["*"] = public


class DocumentResponse(BaseModel):
    id: int
    title: str
    source_type: str
    tags: Optional[List[str]] = None
    acl: Optional[List[str]] = None
    status: str
    chunk_count: int
    created_at: Optional[str] = None


class KBQueryRequest(BaseModel):
    query: str
    top_k: conint(ge=1, le=20) = 5


class ChunkResultResponse(BaseModel):
    chunk_id: int
    doc_id: int
    doc_title: str
    section: str
    content: str
    score: float


class KBQueryResponse(BaseModel):
    hit_level: str  # strong/weak/miss
    top_score: float
    chunks: List[ChunkResultResponse]


class KBStatsResponse(BaseModel):
    total_documents: int
    total_chunks: int
    total_queries: int
    strong_hits: int
    weak_hits: int
    misses: int


# ──── 管理接口 (kb:manage) ────

@router.post("/documents", response_model=DocumentResponse)
async def create_document(
    request: Request,
    req: DocumentCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("kb:manage")),
):
    """入库文档"""
    from services.kb.ingest import ingest_document

    doc_id = await ingest_document(
        db=db,
        title=req.title,
        content=req.content,
        source_type=req.source_type,
        tags=req.tags,
        acl=req.acl,
        created_by=current_user.id,
    )
    
    doc = await db.get(KBDocument, doc_id)
    
    # Audit Log
    try:
        trace_id = request.headers.get("X-Request-ID")
        ip = request.client.host if request.client else "unknown"
        await AuditService.log_business_action(
            db, 
            user_id=current_user.id, 
            username=current_user.username, 
            action="CREATE_KB_DOC", 
            target=f"文档:{doc.title}", 
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS"
        )
        await db.commit()
    except Exception as e:
        logger.error(f"Audit log failed for CREATE_KB_DOC: {e}", exc_info=True)
    
    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        source_type=doc.source_type,
        tags=json.loads(doc.tags) if doc.tags else [],
        acl=json.loads(doc.acl) if doc.acl else ["*"],
        status=doc.status,
        chunk_count=doc.chunk_count,
        created_at=doc.created_at.isoformat() if doc.created_at else None,
    )


@router.get("/documents", response_model=List[DocumentResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("kb:manage")),
):
    """文档列表"""
    result = await db.execute(
        select(KBDocument).order_by(KBDocument.created_at.desc())
    )
    docs = result.scalars().all()
    return [
        DocumentResponse(
            id=d.id,
            title=d.title,
            source_type=d.source_type,
            tags=json.loads(d.tags) if d.tags else [],
            acl=json.loads(d.acl) if d.acl else ["*"],
            status=d.status,
            chunk_count=d.chunk_count,
            created_at=d.created_at.isoformat() if d.created_at else None,
        )
        for d in docs
    ]


@router.get("/documents/{doc_id}", response_model=DocumentCreateRequest)
async def get_document_detail(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("kb:manage")),
):
    """获取文档详情 (含内容) - 优先返回原文，缺失时兼容旧数据。"""
    from sqlalchemy import select
    
    doc = await db.get(KBDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    content = (doc.content or "").strip()
    if not content:
        # Backward compatibility for old rows created before `content` field was introduced.
        result = await db.execute(
            select(KBChunk)
            .where(KBChunk.doc_id == doc_id)
            .order_by(KBChunk.chunk_index)
        )
        chunks = result.scalars().all()
        content = "\n\n".join([c.content for c in chunks]) if chunks else ""

    return DocumentCreateRequest(
        title=doc.title,
        content=content,
        source_type=doc.source_type,
        tags=json.loads(doc.tags) if doc.tags else [],
        acl=json.loads(doc.acl) if doc.acl else ["*"],
    )


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("kb:manage")),
):
    """删除文档 (级联删除 chunks)"""
    doc = await db.get(KBDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await db.delete(doc)
    
    # Audit Log
    try:
        trace_id = request.headers.get("X-Request-ID")
        ip = request.client.host if request.client else "unknown"
        await AuditService.log_business_action(
            db, 
            user_id=current_user.id, 
            username=current_user.username, 
            action="DELETE_KB_DOC", 
            target=f"文档:{doc.title}", 
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS"
        )
    except Exception as e:
        logger.error(f"Audit log failed: {e}")

    await db.commit()
    return {"message": "Document deleted", "id": doc_id}


@router.put("/documents/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: int,
    request: Request,
    req: DocumentCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("kb:manage")),
):
    """更新文档 (全量替换)"""
    from services.kb.ingest import update_document as do_update
    
    success = await do_update(
        db=db,
        doc_id=doc_id,
        title=req.title,
        content=req.content,
        source_type=req.source_type,
        tags=req.tags,
        acl=req.acl,
    )
    
    if not success:
         raise HTTPException(status_code=404, detail="Document not found")
         
    doc = await db.get(KBDocument, doc_id)

    # Audit Log
    try:
        trace_id = request.headers.get("X-Request-ID")
        ip = request.client.host if request.client else "unknown"
        await AuditService.log_business_action(
            db, 
            user_id=current_user.id, 
            username=current_user.username, 
            action="UPDATE_KB_DOC", 
            target=f"文档:{doc.title}", 
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS"
        )
        await db.commit()
    except Exception as e:
        logger.error(f"Audit log failed for UPDATE_KB_DOC: {e}", exc_info=True)

    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        source_type=doc.source_type,
        tags=json.loads(doc.tags) if doc.tags else [],
        acl=json.loads(doc.acl) if doc.acl else ["*"],
        status=doc.status,
        chunk_count=doc.chunk_count,
        created_at=doc.created_at.isoformat() if doc.created_at else None,
    )


@router.post("/documents/{doc_id}/reindex")
async def reindex_document(
    doc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("kb:manage")),
):
    """重建文档索引"""
    from services.kb.ingest import reindex_document as do_reindex

    success = await do_reindex(db, doc_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found or empty")
    
    # Audit Log
    try:
        trace_id = request.headers.get("X-Request-ID")
        ip = request.client.host if request.client else "unknown"
        await AuditService.log_business_action(
            db, 
            user_id=current_user.id, 
            username=current_user.username, 
            action="REINDEX_KB_DOC", 
            target=f"文档ID:{doc_id}", 
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS"
        )
        await db.commit()
    except Exception as e:
        logger.error(f"Audit log failed: {e}")

    return {"message": "Reindex complete", "id": doc_id}


@router.get("/stats", response_model=KBStatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("kb:manage")),
):
    """命中统计"""
    doc_count = (await db.execute(select(func.count(KBDocument.id)))).scalar() or 0
    chunk_count = (await db.execute(select(func.count(KBChunk.id)))).scalar() or 0
    query_count = (await db.execute(select(func.count(KBQueryLog.id)))).scalar() or 0
    strong = (await db.execute(
        select(func.count(KBQueryLog.id)).where(KBQueryLog.hit_level == "strong")
    )).scalar() or 0
    weak = (await db.execute(
        select(func.count(KBQueryLog.id)).where(KBQueryLog.hit_level == "weak")
    )).scalar() or 0
    miss = (await db.execute(
        select(func.count(KBQueryLog.id)).where(KBQueryLog.hit_level == "miss")
    )).scalar() or 0

    return KBStatsResponse(
        total_documents=doc_count,
        total_chunks=chunk_count,
        total_queries=query_count,
        strong_hits=strong,
        weak_hits=weak,
        misses=miss,
    )


# ──── 查询接口 (kb:query) ────

@router.post("/query", response_model=KBQueryResponse)
async def query_kb(
    req: KBQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("kb:query")),
):
    """向量检索 topK"""
    from services.kb.embedder import get_embedding
    from services.kb.retriever import search, classify_hit

    # 1. 生成 query embedding
    query_vec = await get_embedding(req.query)
    if query_vec is None:
        raise HTTPException(status_code=500, detail="Embedding generation failed")

    # 2. ACL 过滤条件
    acl_filter = ["*"]
    if current_user.roles:
        acl_filter.extend([f"role:{r.code}" for r in current_user.roles])
    acl_filter.append(f"user:{current_user.id}")

    # 3. 检索
    chunks = await search(db, query_vec, top_k=req.top_k, acl_filter=acl_filter)

    top_score = chunks[0].score if chunks else 0.0
    hit_level = classify_hit(top_score)

    # 4. 审计日志
    log = KBQueryLog(
        query=req.query[:500],
        top_score=top_score,
        hit_level=hit_level,
        hit_doc_ids=json.dumps([c.doc_id for c in chunks]),
        called_llm=False,
        trace_id=get_trace_id(),
        user_id=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.commit()

    return KBQueryResponse(
        hit_level=hit_level,
        top_score=round(top_score, 4),
        chunks=[
            ChunkResultResponse(
                chunk_id=c.chunk_id,
                doc_id=c.doc_id,
                doc_title=c.doc_title,
                section=c.section,
                content=c.content,
                score=round(c.score, 4),
            )
            for c in chunks
        ],
    )
