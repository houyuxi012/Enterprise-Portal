from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import delete, exists, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import modules.models as models
import utils
from infrastructure.cache_manager import cache

logger = logging.getLogger(__name__)

SYSTEM_PERMISSIONS = {
    "sys:settings:view": "查看偏好设置",
    "sys:settings:edit": "管理偏好设置",
    "sys:user:view": "查看用户及角色",
    "sys:user:edit": "管理用户及角色",
    "sys:user:reset_pwd": "重置用户密码",
    "sys:role:view": "查看角色与权限",
    "sys:role:edit": "管理角色与权限",
    "iam:directory:manage": "管理目录身份源",
    "content:news:edit": "管理新闻资讯",
    "content:announcement:edit": "管理通知公告",
    "content:tool:edit": "管理应用工具",
    "file:upload": "文件上传权限",
    "portal.logs.system.read": "查看系统日志",
    "portal.logs.business.read": "查看业务日志",
    "portal.logs.forwarding.admin": "管理日志转发",
    "portal.ai_audit.read": "查看AI审计",
    "portal.ai.chat.use": "使用AI对话助手",
    "portal.carousel.manage": "管理轮播图",
    "kb:manage": "管理知识库文档",
    "kb:query": "知识库检索",
    "todo:admin": "管理所有待办任务",
    "admin:access": "Access Admin Interface",
}

PORTAL_ADMIN_PERMISSION_CODES = (
    "admin:access",
    "sys:settings:view",
    "sys:user:view",
    "sys:role:view",
    "iam:directory:manage",
    "content:news:edit",
    "content:announcement:edit",
    "content:tool:edit",
    "portal.logs.system.read",
    "portal.logs.business.read",
    "portal.logs.forwarding.admin",
    "portal.ai_audit.read",
    "portal.carousel.manage",
    "file:upload",
    "kb:manage",
    "todo:admin",
)

LEGACY_DEMO_PORTAL_USERNAMES = ("test_portal_plain", "test_portal_admin")
LEGACY_BOOTSTRAP_PASSWORDS = ("ngep#HYX", "admin")

INITIAL_ADMIN_USERNAME = "admin"
INITIAL_ADMIN_PASSWORD_ENV = "INITIAL_ADMIN_PASSWORD"
INITIAL_ADMIN_NAME_ENV = "INITIAL_ADMIN_NAME"
INITIAL_ADMIN_EMAIL_ENV = "INITIAL_ADMIN_EMAIL"
DEFAULT_ADMIN_NAME = "Administrator"
DEFAULT_ADMIN_EMAIL = "admin@local.invalid"
DEFAULT_ADMIN_AVATAR = "/images/admin-avatar.svg"


async def _merge_and_remove_legacy_admin_role(
    db: AsyncSession,
    role_map: dict[str, int],
) -> set[int]:
    legacy_admin_role_id = role_map.get("admin")
    if not legacy_admin_role_id:
        return set()

    portal_admin_role_id = role_map.get("PortalAdmin")
    super_admin_role_id = role_map.get("SuperAdmin")
    if not portal_admin_role_id or not super_admin_role_id:
        logger.warning("Skip legacy admin-role merge: PortalAdmin/SuperAdmin not found.")
        return set()

    legacy_users_result = await db.execute(
        select(models.User.id, models.User.account_type)
        .join(models.user_roles, models.user_roles.c.user_id == models.User.id)
        .where(models.user_roles.c.role_id == legacy_admin_role_id)
    )
    legacy_users = legacy_users_result.all()

    affected_user_ids: set[int] = set()
    promote_rows = []
    for user_id, account_type in legacy_users:
        target_role_id = (
            super_admin_role_id
            if str(account_type or "PORTAL").upper() == "SYSTEM"
            else portal_admin_role_id
        )
        promote_rows.append({"user_id": user_id, "role_id": target_role_id})
        affected_user_ids.add(user_id)

    if promote_rows:
        stmt = insert(models.user_roles).values(promote_rows)
        stmt = stmt.on_conflict_do_nothing(index_elements=["user_id", "role_id"])
        await db.execute(stmt)

    await db.execute(
        models.user_roles.delete().where(models.user_roles.c.role_id == legacy_admin_role_id)
    )
    await db.execute(
        models.role_permissions.delete().where(models.role_permissions.c.role_id == legacy_admin_role_id)
    )
    await db.execute(delete(models.Role).where(models.Role.id == legacy_admin_role_id))
    logger.info("Merged and removed legacy role 'admin' (affected users: %s)", len(affected_user_ids))
    return affected_user_ids


async def _cleanup_legacy_demo_portal_users(db: AsyncSession) -> set[int]:
    user_rows = (
        await db.execute(
            select(models.User.id, models.User.username).where(
                models.User.username.in_(LEGACY_DEMO_PORTAL_USERNAMES)
            )
        )
    ).all()
    if not user_rows:
        return set()

    affected_user_ids = {int(row[0]) for row in user_rows}
    affected_usernames = [row[1] for row in user_rows]

    await db.execute(delete(models.user_roles).where(models.user_roles.c.user_id.in_(affected_user_ids)))
    await db.execute(
        delete(models.UserPasswordHistory).where(
            models.UserPasswordHistory.user_id.in_(affected_user_ids)
        )
    )
    await db.execute(
        delete(models.AnnouncementRead).where(
            models.AnnouncementRead.user_id.in_(affected_user_ids)
        )
    )

    await db.execute(
        update(models.FileMetadata)
        .where(models.FileMetadata.uploader_id.in_(affected_user_ids))
        .values(uploader_id=None)
    )
    await db.execute(
        update(models.Notification)
        .where(models.Notification.created_by.in_(affected_user_ids))
        .values(created_by=None)
    )
    await db.execute(
        update(models.KBDocument)
        .where(models.KBDocument.created_by.in_(affected_user_ids))
        .values(created_by=None)
    )
    await db.execute(
        update(models.Todo)
        .where(models.Todo.creator_id.in_(affected_user_ids))
        .values(creator_id=None)
    )

    await db.execute(delete(models.User).where(models.User.id.in_(affected_user_ids)))
    logger.info("Removed legacy demo users: %s", ",".join(affected_usernames))
    return affected_user_ids


async def _sync_permissions(db: AsyncSession) -> dict[str, int]:
    perms_data = [
        {"app_id": "portal", "code": code, "description": desc}
        for code, desc in SYSTEM_PERMISSIONS.items()
    ]
    if perms_data:
        stmt = insert(models.Permission).values(perms_data)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_perm_app_code",
            set_={"description": stmt.excluded.description},
        )
        await db.execute(stmt)

    perm_result = await db.execute(select(models.Permission))
    return {permission.code: permission.id for permission in perm_result.scalars().all()}


async def _sync_roles(db: AsyncSession) -> dict[str, int]:
    roles_data = [
        {"app_id": "portal", "code": "user", "name": "普通用户", "description": "默认门户用户", "limit_scope": True},
        {"app_id": "portal", "code": "PortalAdmin", "name": "门户管理员", "description": "门户后台管理员角色", "limit_scope": True},
        {"app_id": "portal", "code": "SuperAdmin", "name": "系统超级管理员", "description": "系统超级管理员角色", "limit_scope": False},
    ]
    stmt = insert(models.Role).values(roles_data)
    stmt = stmt.on_conflict_do_nothing(constraint="uq_role_app_code")
    await db.execute(stmt)

    await db.execute(
        update(models.Role)
        .where(models.Role.code.in_(["user", "PortalAdmin"]))
        .values(limit_scope=True)
    )
    await db.execute(
        update(models.Role)
        .where(models.Role.code == "SuperAdmin")
        .values(limit_scope=False)
    )
    await db.execute(
        update(models.Role)
        .where(models.Role.code == "user")
        .values(name="普通用户", description="默认门户用户")
    )
    await db.execute(
        update(models.Role)
        .where(models.Role.code == "PortalAdmin")
        .values(name="门户管理员", description="门户后台管理员角色")
    )
    await db.execute(
        update(models.Role)
        .where(models.Role.code == "SuperAdmin")
        .values(name="系统超级管理员", description="系统超级管理员角色")
    )

    await db.flush()
    role_result = await db.execute(select(models.Role))
    return {role.code: role.id for role in role_result.scalars().all()}


async def _bind_role_permissions(
    db: AsyncSession,
    perm_map: dict[str, int],
    role_map: dict[str, int],
) -> None:
    super_admin_role_id = role_map.get("SuperAdmin")
    if super_admin_role_id:
        role_perms_data = [
            {"role_id": super_admin_role_id, "permission_id": permission_id}
            for permission_id in perm_map.values()
        ]
        if role_perms_data:
            stmt = insert(models.role_permissions).values(role_perms_data)
            stmt = stmt.on_conflict_do_nothing(index_elements=["role_id", "permission_id"])
            await db.execute(stmt)

    portal_admin_role_id = role_map.get("PortalAdmin")
    if portal_admin_role_id:
        portal_admin_rows = [
            {"role_id": portal_admin_role_id, "permission_id": perm_map[code]}
            for code in PORTAL_ADMIN_PERMISSION_CODES
            if code in perm_map
        ]
        if portal_admin_rows:
            stmt = insert(models.role_permissions).values(portal_admin_rows)
            stmt = stmt.on_conflict_do_nothing(index_elements=["role_id", "permission_id"])
            await db.execute(stmt)

    user_role_id = role_map.get("user")
    ai_chat_permission_id = perm_map.get("portal.ai.chat.use")
    if user_role_id and ai_chat_permission_id:
        stmt = insert(models.role_permissions).values(
            [{"role_id": user_role_id, "permission_id": ai_chat_permission_id}]
        )
        stmt = stmt.on_conflict_do_nothing(index_elements=["role_id", "permission_id"])
        await db.execute(stmt)


def _read_bootstrap_env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


async def _warn_if_legacy_admin_password(admin_user: models.User) -> None:
    hashed_password = str(admin_user.hashed_password or "")
    if not hashed_password:
        logger.critical(
            "Admin user '%s' exists without a password hash; rotate and repair the account immediately.",
            INITIAL_ADMIN_USERNAME,
        )
        return

    for legacy_password in LEGACY_BOOTSTRAP_PASSWORDS:
        try:
            if await utils.verify_password(legacy_password, hashed_password):
                logger.critical(
                    "Admin user '%s' still matches a retired bootstrap password. Rotate credentials immediately.",
                    INITIAL_ADMIN_USERNAME,
                )
                return
        except Exception as exc:
            logger.warning("Unable to verify admin password posture during startup: %s", exc)
            return


async def _resolve_initial_admin_email(db: AsyncSession) -> str | None:
    configured_email = _read_bootstrap_env(INITIAL_ADMIN_EMAIL_ENV, DEFAULT_ADMIN_EMAIL)
    if not configured_email:
        return None

    existing_email = await db.execute(
        select(models.User.id).where(models.User.email == configured_email).limit(1)
    )
    if existing_email.scalar_one_or_none() is None:
        return configured_email

    logger.warning(
        "%s=%s is already in use; bootstrapping '%s' without email.",
        INITIAL_ADMIN_EMAIL_ENV,
        configured_email,
        INITIAL_ADMIN_USERNAME,
    )
    return None


async def ensure_rbac_baseline(db: AsyncSession) -> tuple[dict[str, int], dict[str, int], set[int]]:
    logger.info("Initializing RBAC baseline.")
    perm_map = await _sync_permissions(db)
    role_map = await _sync_roles(db)

    affected_user_ids = await _merge_and_remove_legacy_admin_role(db, role_map)

    role_result = await db.execute(select(models.Role))
    role_map = {role.code: role.id for role in role_result.scalars().all()}

    affected_user_ids.update(await _cleanup_legacy_demo_portal_users(db))
    await _bind_role_permissions(db, perm_map, role_map)
    return perm_map, role_map, affected_user_ids


async def init_admin(db: AsyncSession, role_map: dict[str, int]) -> int | None:
    admin_result = await db.execute(
        select(models.User)
        .where(models.User.username == INITIAL_ADMIN_USERNAME)
        .limit(1)
    )
    admin_user = admin_result.scalars().first()
    if admin_user:
        await _warn_if_legacy_admin_password(admin_user)
        return None

    bootstrap_password = _read_bootstrap_env(INITIAL_ADMIN_PASSWORD_ENV)
    if not bootstrap_password:
        raise RuntimeError(
            f"Admin user '{INITIAL_ADMIN_USERNAME}' does not exist and {INITIAL_ADMIN_PASSWORD_ENV} is not set. "
            "Refusing to bootstrap an implicit or hard-coded administrator password."
        )

    super_admin_role_id = role_map.get("SuperAdmin")
    if not super_admin_role_id:
        raise RuntimeError("SuperAdmin role is not initialized; cannot bootstrap admin user.")

    admin_user = models.User(
        username=INITIAL_ADMIN_USERNAME,
        email=await _resolve_initial_admin_email(db),
        hashed_password=await utils.get_password_hash(bootstrap_password),
        account_type="SYSTEM",
        is_active=True,
        name=_read_bootstrap_env(INITIAL_ADMIN_NAME_ENV, DEFAULT_ADMIN_NAME),
        avatar=DEFAULT_ADMIN_AVATAR,
        password_change_required=True,
        password_changed_at=datetime.now(timezone.utc),
        auth_source="local",
    )
    db.add(admin_user)
    await db.flush()

    stmt = insert(models.user_roles).values(
        [{"user_id": admin_user.id, "role_id": super_admin_role_id}]
    )
    stmt = stmt.on_conflict_do_nothing(index_elements=["user_id", "role_id"])
    await db.execute(stmt)
    logger.warning(
        "Bootstrapped initial '%s' administrator from %s.",
        INITIAL_ADMIN_USERNAME,
        INITIAL_ADMIN_PASSWORD_ENV,
    )
    return int(admin_user.id)


async def assign_default_roles_to_roleless_users(
    db: AsyncSession,
    role_map: dict[str, int],
) -> set[int]:
    subquery = select(1).where(models.user_roles.c.user_id == models.User.id)
    stmt = select(models.User).where(~exists(subquery)).options(selectinload(models.User.roles))
    result = await db.execute(stmt)
    users_without_roles = result.scalars().all()

    affected_user_ids: set[int] = set()
    user_roles_data = []

    for user in users_without_roles:
        target_role_id = role_map.get("user")
        if user.username == INITIAL_ADMIN_USERNAME:
            target_role_id = role_map.get("SuperAdmin")
            user.account_type = "SYSTEM"
        else:
            user.account_type = "PORTAL"

        if target_role_id is None:
            continue

        user_roles_data.append({"user_id": user.id, "role_id": target_role_id})
        affected_user_ids.add(int(user.id))

    if user_roles_data:
        stmt = insert(models.user_roles).values(user_roles_data)
        stmt = stmt.on_conflict_do_nothing(index_elements=["user_id", "role_id"])
        await db.execute(stmt)

    return affected_user_ids


async def invalidate_permission_cache(user_ids: Iterable[int]) -> None:
    for user_id in sorted(set(int(uid) for uid in user_ids)):
        try:
            await cache.set(f"user_perm_ver:{user_id}", int(time.time()), ttl=86400)
        except Exception as exc:
            logger.warning("Permission cache invalidation failed for user %s: %s", user_id, exc)
