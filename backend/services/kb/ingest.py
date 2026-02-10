"""
KB Ingest: 文档入库模块
清洗分段 → 生成 embedding → 写入 pgvector。
"""
import asyncio
import json
import logging
import os
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
        content=content,
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
    doc.content = content
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

    # 逐段生成 embedding（限流并发）并写入
    max_concurrency = max(1, min(int(os.getenv("KB_EMBED_CONCURRENCY", "4")), 16))
    semaphore = asyncio.Semaphore(max_concurrency)

    async def _embed_one(idx: int, section: str, chunk_text: str):
        async with semaphore:
            embedding = await get_embedding(chunk_text)
            return idx, section, chunk_text, embedding

    embed_tasks = [
        _embed_one(idx, section, chunk_text)
        for idx, (section, chunk_text) in enumerate(chunks)
    ]
    embedded_rows = await asyncio.gather(*embed_tasks)

    success_count = 0
    for idx, section, chunk_text, embedding in embedded_rows:
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
    """重建文档索引: 删除旧 chunks，基于原始文档内容重新生成 embedding。"""
    from sqlalchemy import select, delete

    # 获取文档
    doc = await db.get(KBDocument, doc_id)
    if not doc:
        return False

    full_text = (doc.content or "").strip()
    if not full_text:
        # Backward compatibility for historical data without raw content.
        result = await db.execute(
            select(KBChunk)
            .where(KBChunk.doc_id == doc_id)
            .order_by(KBChunk.chunk_index)
        )
        old_chunks = result.scalars().all()
        if not old_chunks:
            return False
        logger.warning(
            "Document %s missing raw content, falling back to chunk reconstruction for reindex",
            doc_id,
        )
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
