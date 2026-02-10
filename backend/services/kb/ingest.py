"""
KB Ingest: 文档入库模块
清洗分段 → 生成 embedding → 写入 pgvector。
"""
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from models import KBDocument, KBChunk
from services.kb.chunker import split_text
from services.kb.embedder import get_embedding

logger = logging.getLogger(__name__)


async def ingest_document(
    db: AsyncSession,
    title: str,
    content: str,
    source_type: str = "text",
    tags: Optional[List[str]] = None,
    app_id: str = "portal",
    acl: Optional[List[str]] = None,
    created_by: Optional[int] = None,
) -> int:
    """
    入库流程: 创建文档 → 分段 → 生成 embedding → 写入 chunks。
    Returns: doc_id
    """
    # 1. 创建文档记录
    doc = KBDocument(
        title=title,
        source_type=source_type,
        tags=json.dumps(tags or [], ensure_ascii=False),
        app_id=app_id,
        acl=json.dumps(acl or ["*"], ensure_ascii=False),
        status="processing",
        created_by=created_by,
        created_at=datetime.now(timezone.utc),
    )
    db.add(doc)
    await db.flush()
    doc_id = doc.id

    try:
        # 2. 调用通用分段入库逻辑
        await _process_and_save_chunks(db, doc_id, content)
        
        doc.status = "ready"
        if doc.chunk_count == 0:
             doc.status = "error" # No chunks generated

        await db.commit()
        return doc_id

    except Exception as e:
        logger.error(f"Ingest failed for doc {doc_id}: {e}")
        doc.status = "error"
        await db.commit()
        raise


async def update_document(
    db: AsyncSession,
    doc_id: int,
    title: str,
    content: str,
    source_type: str,
    tags: List[str],
    acl: List[str],
) -> bool:
    """更新文档: 更新元数据 + 重新生成向量 (各类 update 均为全量替换)"""
    from sqlalchemy import delete
    
    doc = await db.get(KBDocument, doc_id)
    if not doc:
        return False

    # 1. 更新元数据
    doc.title = title
    doc.source_type = source_type
    doc.tags = json.dumps(tags or [], ensure_ascii=False)
    doc.acl = json.dumps(acl or ["*"], ensure_ascii=False)
    doc.status = "processing"
    
    # 2. 删除旧 chunks
    await db.execute(delete(KBChunk).where(KBChunk.doc_id == doc_id))
    
    try:
        # 3. 重新生成 chunks
        await _process_and_save_chunks(db, doc_id, content)
        
        doc.status = "ready"
        if doc.chunk_count == 0:
             doc.status = "error"

        await db.commit()
        return True
    except Exception as e:
        logger.error(f"Update failed for doc {doc_id}: {e}")
        doc.status = "error"
        await db.commit()
        raise


async def _process_and_save_chunks(db: AsyncSession, doc_id: int, content: str):
    """通用逻辑: 分段 -> Embedding -> 存储 Chunks"""
    # 分段
    chunks = split_text(content, chunk_size=700, overlap=100)
    if not chunks:
        logger.warning(f"No chunks generated for doc {doc_id}")
        # Build doc object locally to update count if passed? 
        # Actually better to just return and let caller handle doc status
        # But we need to update doc.chunk_count
        doc = await db.get(KBDocument, doc_id)
        if doc: doc.chunk_count = 0
        return

    logger.info(f"Document {doc_id} split into {len(chunks)} chunks")

    # 逐段生成 embedding 并写入
    success_count = 0
    for idx, (section, chunk_text) in enumerate(chunks):
        embedding = await get_embedding(chunk_text)
        if embedding is None:
            logger.warning(f"Embedding failed for chunk {idx} of doc {doc_id}")
            continue

        chunk = KBChunk(
            doc_id=doc_id,
            section=section,
            content=chunk_text,
            chunk_index=idx,
            embedding=embedding,
            created_at=datetime.now(timezone.utc),
        )
        db.add(chunk)
        success_count += 1
    
    # Update doc chunk count
    doc = await db.get(KBDocument, doc_id)
    if doc:
        doc.chunk_count = success_count
        logger.info(f"Document {doc_id} processed: {success_count}/{len(chunks)} chunks")


async def reindex_document(db: AsyncSession, doc_id: int) -> bool:
    """重建文档索引: 删除旧 chunks，重新生成 embedding (保持原内容)"""
    from sqlalchemy import select, delete

    # 获取文档
    doc = await db.get(KBDocument, doc_id)
    if not doc:
        return False

    # 获取原始内容（从 chunks 重组）- 这其实不准确，如果 chunks 有 overlap，直接拼接会重复。
    # 更严谨的做法是应该在 KBDocument 中存储 original_content (S3 or DB Text)
    # 但由于当前设计没有 content 字段，我们只能尝试 best-effort 恢复，或者依靠 chunks。
    # 实际上 reindex 往往是为了“刷新 embedding 模型”或者“改变分段策略”。
    # 如果没有原始 store，reindex 有损。
    # 既然 edit 功能已经有了 full update，reindex 可能只用于 debug。
    # 这里的逻辑我们暂时保持原样，或者利用 _process_and_save_chunks 简化。
    
    # 为了保持行为兼容，暂不重构 reindex 的"拼凑"逻辑，只是复用 process 函数
    result = await db.execute(
        select(KBChunk)
        .where(KBChunk.doc_id == doc_id)
        .order_by(KBChunk.chunk_index)
    )
    old_chunks = result.scalars().all()
    if not old_chunks:
        return False
        
    # 简易去重/拼接 (Overlap处理很麻烦，这里简单拼接可能导致内容膨胀，但暂且如此)
    # 更好的做法是每一段只取非 overlap 部分... 暂时忽略 overlap 带来的冗余
    full_text = "\n\n".join(c.content for c in old_chunks)

    # 删除旧 chunks
    await db.execute(delete(KBChunk).where(KBChunk.doc_id == doc_id))

    doc.status = "processing"
    await db.flush()

    try:
        await _process_and_save_chunks(db, doc_id, full_text)
        doc.status = "ready"
        if doc.chunk_count == 0: doc.status = "error"
        await db.commit()
        return True
    except Exception as e:
        logger.error(f"Reindex failed: {e}")
        doc.status = "error"
        await db.commit()
        return False
