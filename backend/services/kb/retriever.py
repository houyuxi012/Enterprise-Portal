"""
KB Retriever: 向量检索模块
基于 pgvector 的语义检索，支持 ACL 过滤。
"""
import json
import logging
from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass
class ChunkResult:
    chunk_id: int
    doc_id: int
    doc_title: str
    section: str
    content: str
    score: float


# 阈值配置
import os

# 阈值配置
if os.getenv("GEMINI_API_KEY"):
    STRONG_HIT_THRESHOLD = 0.82
    WEAK_HIT_THRESHOLD = 0.65
else:
    # Mock N-gram 向量因稀疏性导致分数极低
    # 典型值：完全匹配约 0.1-0.2，部分匹配 0.05
    STRONG_HIT_THRESHOLD = 0.1
    WEAK_HIT_THRESHOLD = 0.01


async def search(
    db: AsyncSession,
    query_embedding: List[float],
    top_k: int = 5,
    acl_filter: Optional[List[str]] = None,
) -> List[ChunkResult]:
    """
    向量相似度检索 + ACL 过滤。
    score = 1 - cosine_distance (越高越相似)
    """
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    # 基础 SQL: cosine 相似度检索
    sql = text("""
        SELECT
            c.id AS chunk_id,
            c.doc_id,
            d.title AS doc_title,
            COALESCE(c.section, '') AS section,
            c.content,
            1 - (c.embedding <=> CAST(:embedding AS vector)) AS score
        FROM kb_chunks c
        JOIN kb_documents d ON c.doc_id = d.id
        WHERE d.status = 'ready'
        ORDER BY c.embedding <=> CAST(:embedding AS vector)
        LIMIT :top_k
    """)

    result = await db.execute(sql, {"embedding": embedding_str, "top_k": top_k * 3})
    rows = result.fetchall()

    # ACL 过滤
    chunks: List[ChunkResult] = []
    for row in rows:
        if len(chunks) >= top_k:
            break

        chunk = ChunkResult(
            chunk_id=row.chunk_id,
            doc_id=row.doc_id,
            doc_title=row.doc_title,
            section=row.section,
            content=row.content,
            score=row.score,
        )

        # ACL 检查
        if acl_filter:
            try:
                doc_result = await db.execute(
                    text("SELECT acl FROM kb_documents WHERE id = :doc_id"),
                    {"doc_id": row.doc_id},
                )
                doc_row = doc_result.fetchone()
                if doc_row:
                    doc_acl = json.loads(doc_row.acl or '["*"]')
                    if "*" not in doc_acl and not any(a in doc_acl for a in acl_filter):
                        continue
            except Exception:
                pass

        chunks.append(chunk)

    return chunks


def classify_hit(top_score: float) -> str:
    """根据最高分数分类命中级别"""
    if top_score >= STRONG_HIT_THRESHOLD:
        return "strong"
    elif top_score >= WEAK_HIT_THRESHOLD:
        return "weak"
    return "miss"
