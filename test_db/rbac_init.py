from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Iterable

_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _candidate in (
    os.path.join(_repo_root, "Next-Gen Enterprise Portal", "backend"),
    os.path.join(_repo_root, "code", "backend"),
    os.path.join(_repo_root, "backend"),
    _repo_root,
):
    if os.path.isdir(_candidate) and _candidate not in sys.path:
        sys.path.append(_candidate)

from core.database import SessionLocal
from modules.iam.services.rbac_bootstrap import ensure_rbac_baseline, invalidate_permission_cache

logger = logging.getLogger(__name__)


async def _refresh_permission_cache(user_ids: Iterable[int]) -> None:
    try:
        await invalidate_permission_cache(user_ids)
    except Exception as exc:  # pragma: no cover - best effort for local seeds
        logger.warning("Permission cache invalidation failed during test RBAC init: %s", exc)


async def init_rbac() -> None:
    print("Starting test RBAC baseline sync...")
    async with SessionLocal() as db:
        perm_map, role_map, affected_user_ids = await ensure_rbac_baseline(db)
        await db.commit()

    if affected_user_ids:
        await _refresh_permission_cache(affected_user_ids)

    print(
        "RBAC baseline synced. "
        f"roles={len(role_map)} permissions={len(perm_map)} affected_users={len(affected_user_ids)}"
    )


if __name__ == "__main__":
    asyncio.run(init_rbac())
