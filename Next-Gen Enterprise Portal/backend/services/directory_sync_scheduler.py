from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import delete as sa_delete, select

import models
from iam.audit.service import IAMAuditService
from services.identity.identity_service import ProviderIdentityService
from services.identity.providers import IdentityProviderError, LdapIdentityProvider
from services.license_service import LicenseService

logger = logging.getLogger(__name__)


@dataclass
class _SyncPlanItem:
    directory_id: int
    interval_minutes: int


class DirectorySyncScheduler:
    _last_attempt_by_directory: dict[int, datetime] = {}
    _running: bool = False

    @classmethod
    def _tick_seconds(cls) -> int:
        raw = os.getenv("DIRECTORY_SYNC_TICK_SECONDS", "60")
        try:
            return max(10, int(raw))
        except ValueError:
            return 60

    @classmethod
    def _sync_user_limit(cls) -> int:
        raw = os.getenv("DIRECTORY_SYNC_USER_LIMIT", "1000")
        try:
            return min(max(10, int(raw)), 5000)
        except ValueError:
            return 1000

    @classmethod
    async def run_scheduler(cls, session_factory) -> None:
        tick = cls._tick_seconds()
        logger.info("Starting directory sync scheduler, tick=%ss", tick)
        while True:
            try:
                await cls.run_once(session_factory)
            except asyncio.CancelledError:
                logger.info("Directory sync scheduler cancelled.")
                raise
            except Exception as exc:
                logger.error("Directory sync scheduler loop failed: %s", exc, exc_info=True)
            await asyncio.sleep(tick)

    @classmethod
    async def run_once(cls, session_factory) -> None:
        if cls._running:
            return
        cls._running = True
        try:
            plans = await cls._collect_plans(session_factory)
            now = datetime.now(timezone.utc)
            active_ids = {p.directory_id for p in plans}
            for stale_id in list(cls._last_attempt_by_directory.keys()):
                if stale_id not in active_ids:
                    cls._last_attempt_by_directory.pop(stale_id, None)

            for plan in plans:
                if not cls._should_run(plan, now):
                    continue
                cls._last_attempt_by_directory[plan.directory_id] = now
                await cls._sync_directory(session_factory, plan.directory_id, now)
        finally:
            cls._running = False

    @classmethod
    async def _collect_plans(cls, session_factory) -> list[_SyncPlanItem]:
        async with session_factory() as db:
            try:
                await LicenseService.require_feature(db, "ldap")
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {}
                code = str((detail or {}).get("code") or "")
                if code.upper() == "LICENSE_REQUIRED":
                    logger.debug("Skipping directory auto-sync: ldap feature not licensed.")
                    return []
                raise

            result = await db.execute(
                select(models.DirectoryConfig).where(
                    models.DirectoryConfig.enabled == True,  # noqa: E712
                    models.DirectoryConfig.sync_mode == "auto",
                    models.DirectoryConfig.type.in_(["ldap", "ad"]),
                )
            )
            configs = result.scalars().all()

            plans: list[_SyncPlanItem] = []
            for cfg in configs:
                try:
                    interval = int(cfg.sync_interval_minutes or 60)
                except (TypeError, ValueError):
                    interval = 60
                interval = min(max(interval, 5), 10080)
                plans.append(_SyncPlanItem(directory_id=cfg.id, interval_minutes=interval))
            return plans

    @classmethod
    def _should_run(cls, plan: _SyncPlanItem, now: datetime) -> bool:
        last = cls._last_attempt_by_directory.get(plan.directory_id)
        if last is None:
            return True
        return (now - last).total_seconds() >= plan.interval_minutes * 60

    @classmethod
    async def _sync_directory(cls, session_factory, directory_id: int, now: datetime) -> None:
        provider = LdapIdentityProvider()
        sync_limit = cls._sync_user_limit()
        async with session_factory() as db:
            config = await db.get(models.DirectoryConfig, directory_id)
            if not config:
                return
            if not bool(config.enabled):
                return
            if str(config.sync_mode or "manual").lower() != "auto":
                return

            synced_user_count = 0
            synced_group_count = 0
            synced_org_count = 0
            failed_count = 0
            fetched_count = 0
            removed_count = 0
            removed_users: list[str] = []
            reason = None
            result_status = "success"

            source_label = "OpenLDAP" if str(config.type or "").lower() == "ldap" else "Active Directory"
            current_cursor = config.sync_cursor

            try:
                # 1. Sync Organizations
                orgs, orgs_cursor = await provider.sync_orgs(
                    db=db, directory_config=config, limit=sync_limit, sync_cursor=current_cursor,
                )
                org_mapping: dict[str, int] = {}
                dn_to_dept: dict[str, int] = {}
                for org in orgs:
                    try:
                        async with db.begin_nested():
                            dept = await ProviderIdentityService._jit_upsert_org(db, config.id, org)
                            await db.flush()
                            org_mapping[org.external_id] = dept.id
                            if org.dn:
                                dn_to_dept[org.dn] = dept.id
                            synced_org_count += 1
                    except Exception as org_exc:
                        logger.warning("Auto sync org upsert failed: %s %s", org.external_id, org_exc)
                        
                for org in orgs:
                    if org.parent_external_id and org.external_id in org_mapping:
                        child_id = org_mapping[org.external_id]
                        parent_id = dn_to_dept.get(org.parent_external_id) or org_mapping.get(org.parent_external_id)
                        if parent_id:
                            await db.execute(update(models.Department).where(models.Department.id == child_id).values(parent_id=parent_id))

                # 2. Sync Groups
                groups, groups_cursor = await provider.sync_groups(
                    db=db, directory_config=config, limit=sync_limit, sync_cursor=current_cursor,
                )
                for group in groups:
                    try:
                        async with db.begin_nested():
                            await ProviderIdentityService._jit_upsert_group_as_role(db, config.id, group)
                            synced_group_count += 1
                    except Exception as grp_exc:
                        logger.warning("Auto sync group upsert failed: %s %s", group.external_id, grp_exc)

                # 3. Sync Users
                users, users_cursor = await provider.sync_users(
                    db=db,
                    directory_config=config,
                    limit=sync_limit,
                    sync_cursor=current_cursor,
                )
                fetched_count = len(users)

                ldap_external_ids: set[str] = set()

                for auth_result in users:
                    try:
                        async with db.begin_nested():
                            await ProviderIdentityService._jit_upsert_portal_user(  # noqa: SLF001
                                db,
                                auth_result=auth_result,
                                directory_id=config.id,
                                org_mapping=org_mapping,
                                dn_to_dept=dn_to_dept,
                            )
                        synced_user_count += 1
                        if auth_result.external_id:
                            ldap_external_ids.add(auth_result.external_id)
                    except Exception as user_exc:
                        failed_count += 1
                        logger.warning(
                            "Directory sync user upsert failed: directory_id=%s username=%s err=%s",
                            config.id,
                            auth_result.username,
                            user_exc,
                        )

                # 自动调度仅执行增量同步，不清理LDAP不存在的本地用户（通常留给全量同步解决）

                if users_cursor:
                    config.sync_cursor = users_cursor
                    db.add(config)

                await IAMAuditService.log(
                    db=db,
                    action="IAM_DIRECTORY_SYNC",
                    target_type="directory",
                    user_id=0,
                    username="system_auto",
                    target_id=config.id,
                    target_name=config.name,
                    detail={
                        "directory_id": config.id,
                        "sync_mode": config.sync_mode,
                        "sync_interval_minutes": config.sync_interval_minutes,
                        "fetched_count": fetched_count,
                        "synced_user_count": synced_user_count,
                        "synced_org_count": synced_org_count,
                        "synced_group_count": synced_group_count,
                        "failed_count": failed_count,
                        "removed_count": removed_count,
                        "removed_users": removed_users,
                        "executed_at": now.isoformat(),
                        "cursor_used": current_cursor,
                        "new_cursor": users_cursor,
                    },
                    result="success",
                    ip_address="127.0.0.1",
                    user_agent="directory-sync-scheduler",
                )
                await db.commit()
            except IdentityProviderError as exc:
                result_status = "fail"
                reason = exc.code
                await IAMAuditService.log(
                    db=db,
                    action="IAM_DIRECTORY_SYNC",
                    target_type="directory",
                    user_id=0,
                    username="system_auto",
                    target_id=config.id,
                    target_name=config.name,
                    detail={
                        "directory_id": config.id,
                        "sync_mode": config.sync_mode,
                        "sync_interval_minutes": config.sync_interval_minutes,
                        "fetched_count": fetched_count,
                        "synced_user_count": synced_user_count,
                        "failed_count": failed_count,
                        "removed_count": removed_count,
                        "removed_users": removed_users,
                        "executed_at": now.isoformat(),
                    },
                    result="fail",
                    reason=exc.code,
                    ip_address="127.0.0.1",
                    user_agent="directory-sync-scheduler",
                )
                await db.commit()
            except Exception as exc:
                result_status = "fail"
                reason = "DIRECTORY_SYNC_INTERNAL_ERROR"
                logger.error(
                    "Directory sync failed: directory_id=%s err=%s",
                    config.id,
                    exc,
                    exc_info=True,
                )
                await db.rollback()
                try:
                    await IAMAuditService.log(
                        db=db,
                        action="IAM_DIRECTORY_SYNC",
                        target_type="directory",
                        user_id=0,
                        username="system_auto",
                        target_id=config.id,
                        target_name=config.name,
                        detail={
                            "directory_id": config.id,
                            "sync_mode": config.sync_mode,
                            "sync_interval_minutes": config.sync_interval_minutes,
                            "fetched_count": fetched_count,
                            "synced_user_count": synced_user_count,
                            "failed_count": failed_count,
                            "removed_count": removed_count,
                            "removed_users": removed_users,
                            "executed_at": now.isoformat(),
                        },
                        result="fail",
                        reason=reason,
                        ip_address="127.0.0.1",
                        user_agent="directory-sync-scheduler",
                    )
                    await db.commit()
                except Exception:
                    await db.rollback()
            finally:
                logger.info(
                    "Directory sync finished: id=%s result=%s reason=%s fetched=%s synced=%s failed=%s removed=%s",
                    config.id,
                    result_status,
                    reason,
                    fetched_count,
                    synced_user_count,
                    failed_count,
                    removed_count,
                )
