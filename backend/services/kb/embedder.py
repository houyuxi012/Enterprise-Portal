"""
KB Embedder: 向量生成模块
使用 Google Gemini text-embedding-004 生成 768 维向量。
"""
import logging
import os
from typing import List, Optional

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        from google import genai
        api_key = os.getenv("GEMINI_API_KEY", "")
        _client = genai.Client(api_key=api_key)
    return _client


EMBEDDING_MODEL = "text-embedding-004"
EMBEDDING_DIMS = 768

def _mock_embedding_ngram(text: str) -> List[float]:
    """
    基于字符 n-gram 的伪向量生成算法。
    改进版：混合 unigram + bigram，去除平滑以减少冲突。
    """
    import hashlib
    import math
    
    vec = [0.0] * EMBEDDING_DIMS
    if not text:
        return vec
        
    # 混合特征：单字 + 双字
    grams = list(text)  # unigrams
    n = 2
    if len(text) >= n:
        grams.extend([text[i:i+n] for i in range(len(text)-n+1)])
    
    for gram in grams:
        hash_val = int(hashlib.md5(gram.encode('utf-8')).hexdigest(), 16)
        dim_index = hash_val % EMBEDDING_DIMS
        
        # Bigram 权重 2.0，Unigram 权重 1.0
        weight = 2.0 if len(gram) > 1 else 1.0
        vec[dim_index] += weight
        
    # L2 Norm
    norm = math.sqrt(sum(v*v for v in vec))
    if norm > 0:
        vec = [v/norm for v in vec]
        
    return vec




async def get_embedding(text: str) -> Optional[List[float]]:
    """生成单条文本的 embedding 向量"""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        logger.warning(f"GEMINI_API_KEY not set. Generating n-gram mock vector for: {text[:30]}...")
        return _mock_embedding_ngram(text)

    try:
        # Lazy import to avoid error if google-genai not installed
        import google.genai as genai
        
        client = _get_client()
        # client is a genai.Client instance
        if not client:
             return [0.0] * EMBEDDING_DIMS
             
        # New SDK usage: client.models.embed_content
        result = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
        )
        # The result object structure depends on the exact SDK version
        # It's usually result.embeddings[0].values or similar
        return result.embeddings[0].values
    except ImportError:
        logger.error("google-genai library not installed")
        return [0.0] * EMBEDDING_DIMS
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        # Return None on actual failure to signify error
        return None



async def get_embeddings_batch(texts: List[str]) -> List[Optional[List[float]]]:
    """批量生成 embedding（逐条调用，Gemini SDK暂不支持真batch）"""
    results = []
    for text in texts:
        vec = await get_embedding(text)
        results.append(vec)
    return results
