from datetime import datetime, timezone
import json
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.dependencies import PermissionChecker
import modules.models as models
import modules.schemas as schemas
from modules.admin.services.notification_templates import resolve_notification_template
from modules.iam.routers.auth import get_current_user
from modules.portal.services.notifications import build_recipient_notifications
from application.portal_app import AuditService

router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
)

admin_router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
)

ALLOWED_NOTIFICATION_TYPES = {"info", "success", "warning", "reminder"}


def _normalize_notification_type(raw_type: str | None) -> str:
    value = (raw_type or "info").strip().lower()
    if value not in ALLOWED_NOTIFICATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"通知类型不合法，允许值: {', '.join(sorted(ALLOWED_NOTIFICATION_TYPES))}",
        )
    return value


async def _resolve_target_users(
    db: AsyncSession,
    *,
    broadcast: bool,
    user_ids: List[int],
) -> List[models.User]:
    if broadcast:
        result = await db.execute(
            select(models.User)
            .filter(
                models.User.account_type == "PORTAL",
                models.User.is_active.is_(True),
            )
            .order_by(models.User.id.asc())
        )
        users = result.scalars().all()
    else:
        unique_user_ids = sorted({int(uid) for uid in user_ids if int(uid) > 0})
        if not unique_user_ids:
            raise HTTPException(status_code=400, detail="请至少选择一个接收用户")

        result = await db.execute(
            select(models.User)
            .filter(
                models.User.id.in_(unique_user_ids),
                models.User.account_type == "PORTAL",
            )
            .order_by(models.User.id.asc())
        )
        users = result.scalars().all()
        if len(users) != len(unique_user_ids):
            raise HTTPException(status_code=400, detail="部分用户不存在或不是 PORTAL 账号")

    if not users:
        raise HTTPException(status_code=400, detail="没有可推送的目标用户")
    return list(users)


@router.get("/", response_model=List[schemas.NotificationItem])
async def list_my_notifications(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    unread_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = (
        select(models.NotificationReceipt)
        .options(selectinload(models.NotificationReceipt.notification))
        .filter(models.NotificationReceipt.user_id == current_user.id)
    )
    if unread_only:
        query = query.filter(models.NotificationReceipt.is_read.is_(False))

    query = query.order_by(
        desc(models.NotificationReceipt.created_at),
        desc(models.NotificationReceipt.id),
    )

    receipts = (await db.execute(query.limit(limit).offset(offset))).scalars().all()
    return [
        {
            "id": receipt.notification.id,
            "title": receipt.notification.title,
            "message": receipt.notification.message,
            "type": receipt.notification.type,
            "action_url": receipt.notification.action_url,
            "created_at": receipt.notification.created_at,
            "is_read": receipt.is_read,
            "read_at": receipt.read_at,
        }
        for receipt in receipts
        if receipt.notification is not None
    ]


@router.get("/unread-count", response_model=schemas.NotificationUnreadCount)
async def get_unread_notification_count(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    unread_count = (
        await db.execute(
            select(func.count(models.NotificationReceipt.id)).filter(
                models.NotificationReceipt.user_id == current_user.id,
                models.NotificationReceipt.is_read.is_(False),
            )
        )
    ).scalar_one()
    return {"unread_count": int(unread_count or 0)}


@router.post("/read", response_model=schemas.NotificationReadStateResponse)
async def mark_notifications_as_read(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: schemas.NotificationReadStateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    notification_ids = sorted({int(i) for i in (payload.notification_ids or []) if int(i) > 0})
    if not notification_ids:
        return {"notification_ids": []}

    receipts = (
        await db.execute(
            select(models.NotificationReceipt)
            .options(selectinload(models.NotificationReceipt.notification))
            .filter(
                models.NotificationReceipt.user_id == current_user.id,
                models.NotificationReceipt.notification_id.in_(notification_ids),
            )
        )
    ).scalars().all()

    read_ids: List[int] = []
    newly_marked_ids: List[int] = []
    notification_summaries: List[dict] = []
    now = datetime.now(timezone.utc)
    for receipt in receipts:
        read_ids.append(receipt.notification_id)
        if receipt.notification is not None:
            notification_summaries.append(
                {
                    "id": receipt.notification_id,
                    "title": (receipt.notification.title or "").strip(),
                    "message": (receipt.notification.message or "").strip()[:200],
                }
            )
        if not receipt.is_read:
            receipt.is_read = True
            receipt.read_at = now
            db.add(receipt)
            newly_marked_ids.append(receipt.notification_id)

    detail_payload = {
        "requested_ids": notification_ids,
        "matched_ids": sorted(set(read_ids)),
        "newly_marked_ids": sorted(set(newly_marked_ids)),
        "changed_count": len(newly_marked_ids),
        "notifications": notification_summaries[:10],
    }
    if len(notification_summaries) > 10:
        detail_payload["notifications_more_count"] = len(notification_summaries) - 10

    await db.commit()
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="MARK_NOTIFICATIONS_READ",
        target="通知已读",
        detail=json.dumps(detail_payload, ensure_ascii=False, indent=2),
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return {"notification_ids": sorted(set(read_ids))}


@router.post("/read-all", response_model=schemas.NotificationUnreadCount)
async def mark_all_notifications_as_read(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    receipts = (
        await db.execute(
            select(models.NotificationReceipt)
            .options(selectinload(models.NotificationReceipt.notification))
            .filter(
                models.NotificationReceipt.user_id == current_user.id,
                models.NotificationReceipt.is_read.is_(False),
            )
        )
    ).scalars().all()

    now = datetime.now(timezone.utc)
    changed = 0
    changed_notifications: List[dict] = []
    for receipt in receipts:
        receipt.is_read = True
        receipt.read_at = now
        db.add(receipt)
        changed += 1
        if receipt.notification is not None:
            changed_notifications.append(
                {
                    "id": receipt.notification_id,
                    "title": (receipt.notification.title or "").strip(),
                    "message": (receipt.notification.message or "").strip()[:200],
                }
            )

    detail_payload = {
        "changed_count": changed,
        "notifications": changed_notifications[:10],
    }
    if len(changed_notifications) > 10:
        detail_payload["notifications_more_count"] = len(changed_notifications) - 10

    await db.commit()
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="MARK_ALL_NOTIFICATIONS_READ",
        target="通知已读",
        detail=json.dumps(detail_payload, ensure_ascii=False, indent=2),
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return {"unread_count": 0}


@admin_router.post(
    "/push",
    response_model=schemas.NotificationPushResult,
    status_code=status.HTTP_201_CREATED,
)
async def push_notification(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: schemas.NotificationPushRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("content:announcement:edit")),
):
    notify_type = _normalize_notification_type(payload.type)
    target_users = await _resolve_target_users(
        db,
        broadcast=bool(payload.broadcast),
        user_ids=list(payload.user_ids or []),
    )

    template = None
    base_message = payload.message.strip()
    base_title = payload.title.strip()
    action_url = (payload.action_url or "").strip() or None
    template_context = {key: str(value) for key, value in (payload.template_variables or {}).items()}
    if payload.template_id:
        template = await resolve_notification_template(
            db,
            channel="im",
            template_id=int(payload.template_id),
            enabled_only=True,
        )
        if template is None:
            raise HTTPException(status_code=400, detail="即时通讯模板不存在或未启用")
        if action_url:
            template_context.setdefault("action_link", action_url)

    try:
        created_notifications = build_recipient_notifications(
            recipients=target_users,
            created_by=current_user.id,
            notification_type=notify_type,
            action_url=action_url,
            base_title=base_title,
            base_message=base_message,
            template=template,
            template_context=template_context,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for db_notification in created_notifications:
        db.add(db_notification)

    await db.flush()
    created_notification_ids = [notification.id for notification in created_notifications if notification.id is not None]

    await db.commit()
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="PUSH_NOTIFICATION",
        target=f"通知:{created_notifications[0].title}",
        detail=(
            f"notification_ids={created_notification_ids[:10]}, type={notify_type}, "
            f"broadcast={bool(payload.broadcast)}, recipients={len(target_users)}, "
            f"template={template.code if template is not None else 'none'}"
        ),
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="SYSTEM",
    )

    return {
        "notification_id": created_notification_ids[0],
        "recipient_count": len(target_users),
    }
