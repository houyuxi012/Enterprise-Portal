from __future__ import annotations

from math import ceil
from typing import Any


def paginate(*, total: int, page: int, page_size: int, items: list[Any]) -> dict[str, Any]:
    total_pages = ceil(total / page_size) if page_size > 0 else 0
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "items": items,
    }

