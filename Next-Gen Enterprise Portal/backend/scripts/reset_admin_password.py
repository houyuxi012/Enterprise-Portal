#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Final

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

import modules.models as models
from core.database import SessionLocal
from iam.audit.service import IAMAuditService
from iam.identity.service import IdentityService
from infrastructure.cache_manager import cache
from modules.iam.services.password_policy import set_user_password
from modules.iam.services.rbac_bootstrap import ensure_rbac_baseline, invalidate_permission_cache

DEFAULT_ADMIN_USERNAME: Final[str] = "admin"
SCRIPT_OPERATOR: Final[str] = "ops/reset-admin-password"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reset the built-in administrator password and force a password change at next login.",
    )
    parser.add_argument(
        "--username",
        default=DEFAULT_ADMIN_USERNAME,
        help=f"Username to reset (default: {DEFAULT_ADMIN_USERNAME}).",
    )
    parser.add_argument(
        "--password",
        help="New temporary password to set. Required.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Required confirmation flag. The script will not run without it.",
    )
    return parser.parse_args()


async def _maybe_init_cache() -> bool:
    try:
        await cache.init()
        return True
    except Exception as exc:
        print(f"[warn] cache init failed; permission cache/session revocation will be skipped: {exc}")
        return False


async def _revoke_sessions_if_possible(user_id: int, cache_ready: bool) -> int:
    if not cache_ready:
        return 0
    revoked_sessions = 0
    revoked_sessions += await IdentityService._revoke_all_sessions_for_user(user_id=user_id, audience="admin")
    revoked_sessions += await IdentityService._revoke_all_sessions_for_user(user_id=user_id, audience="portal")
    return revoked_sessions


async def reset_admin_password(*, username: str, password: str) -> int:
    cache_ready = await _maybe_init_cache()
    user_id: int | None = None
    affected_user_ids: set[int] = set()

    try:
        async with SessionLocal() as db:
            _, role_map, affected_user_ids = await ensure_rbac_baseline(db)

            result = await db.execute(
                select(models.User).where(models.User.username == username).limit(1)
            )
            admin_user = result.scalars().first()
            if admin_user is None:
                raise RuntimeError(
                    f"User '{username}' does not exist. "
                    "If this is a brand new environment, set INITIAL_ADMIN_PASSWORD and start the app once."
                )

            super_admin_role_id = role_map.get("SuperAdmin")
            if not super_admin_role_id:
                raise RuntimeError("SuperAdmin role is not initialized; cannot repair admin access.")

            await set_user_password(db, admin_user, password, validate=False)
            admin_user.account_type = "SYSTEM"
            admin_user.auth_source = "local"
            admin_user.is_active = True
            admin_user.failed_attempts = 0
            admin_user.locked_until = None
            admin_user.password_change_required = True
            admin_user.password_violates_policy = False
            db.add(admin_user)

            stmt = insert(models.user_roles).values(
                [{"user_id": admin_user.id, "role_id": super_admin_role_id}]
            )
            stmt = stmt.on_conflict_do_nothing(index_elements=["user_id", "role_id"])
            await db.execute(stmt)

            await IAMAuditService.log(
                db,
                action="iam.user.password_reset.manual",
                target_type="user",
                username=SCRIPT_OPERATOR,
                target_id=admin_user.id,
                target_name=admin_user.username,
                detail={
                    "script": os.path.basename(__file__),
                    "forced_password_change": True,
                    "restored_local_auth": True,
                    "restored_super_admin": True,
                },
                result="success",
                reason="manual_admin_password_reset",
            )

            await db.commit()
            user_id = int(admin_user.id)

        if user_id is not None and cache_ready:
            affected_user_ids.add(user_id)
            await invalidate_permission_cache(affected_user_ids)

        revoked_sessions = await _revoke_sessions_if_possible(user_id or 0, cache_ready) if user_id else 0
        print(
            f"reset ok: username={username} temporary_password_set=true "
            f"forced_change=true revoked_sessions={revoked_sessions}"
        )
        return 0
    finally:
        if cache_ready:
            await cache.close()


def main() -> int:
    args = parse_args()
    if not args.yes:
        print("refusing to run without --yes")
        return 2
    password = str(args.password or "").strip()
    if not password:
        print("refusing to run without --password")
        return 2
    return asyncio.run(reset_admin_password(username=str(args.username).strip(), password=password))


if __name__ == "__main__":
    raise SystemExit(main())
