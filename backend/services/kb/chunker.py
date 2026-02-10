"""
KB Chunker: 文本分段模块
按标题/段落切分文档，支持 Markdown heading 感知。
"""
import re
from typing import List, Tuple


def split_text(
    text: str,
    chunk_size: int = 700,
    overlap: int = 100,
) -> List[Tuple[str, str]]:
    """
    将文本按段落/标题分段。
    Returns: [(section_title, chunk_content), ...]
    """
    if not text or not text.strip():
        return []

    # 按 markdown heading 或双换行分割为逻辑段落
    sections = _split_by_headings(text)

    chunks: List[Tuple[str, str]] = []
    for section_title, section_body in sections:
        section_chunks = _sliding_window(section_body, chunk_size, overlap)
        for chunk in section_chunks:
            chunks.append((section_title, chunk))

    return chunks


def _split_by_headings(text: str) -> List[Tuple[str, str]]:
    """按 Markdown heading 分割文档为 (title, body) 列表"""
    lines = text.split("\n")
    sections: List[Tuple[str, str]] = []
    current_title = ""
    current_lines: List[str] = []

    for line in lines:
        # 检测 # heading
        heading_match = re.match(r"^(#{1,4})\s+(.+)$", line)
        if heading_match:
            # 保存前一个 section
            if current_lines:
                body = "\n".join(current_lines).strip()
                if body:
                    sections.append((current_title, body))
            current_title = heading_match.group(2).strip()
            current_lines = []
        else:
            current_lines.append(line)

    # 保存最后一个 section
    if current_lines:
        body = "\n".join(current_lines).strip()
        if body:
            sections.append((current_title, body))

    # 如果没有 heading，整体作为一个 section
    if not sections and text.strip():
        sections.append(("", text.strip()))

    return sections


def _sliding_window(text: str, chunk_size: int, overlap: int) -> List[str]:
    """滑动窗口切分长文本"""
    if len(text) <= chunk_size:
        return [text] if text.strip() else []

    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size

        # 尝试在句号/换行处断开
        if end < len(text):
            # 在 chunk_size 范围内找最后一个合适的断点
            for sep in ["\n\n", "\n", "。", ".", "；", ";", "！", "!", "？", "?"]:
                last_sep = text.rfind(sep, start + chunk_size // 2, end)
                if last_sep > start:
                    end = last_sep + len(sep)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - overlap
        if start >= len(text):
            break

    return chunks
