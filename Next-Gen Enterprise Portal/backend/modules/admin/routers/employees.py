from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from core.database import get_db
import modules.models as models
import modules.schemas as schemas
from sqlalchemy import select, delete as sa_delete
from fastapi import Request
from application.admin_app import (
    AuditService,
    generate_compliant_password,
    get_password_policy_configs,
    set_user_password,
    validate_password,
)
from core.dependencies import PermissionChecker
from modules.iam.routers.auth import get_current_user

router = APIRouter(
    prefix="/employees",
    tags=["employees"]
)

app_router = APIRouter(
    prefix="/employees",
    tags=["employees"]
)


async def _assert_user_email_available(
    db: AsyncSession,
    *,
    email: str | None,
    exclude_user_id: int | None = None,
) -> None:
    normalized_email = str(email or "").strip()
    if not normalized_email:
        return
    query = select(models.User).filter(models.User.email == normalized_email)
    if exclude_user_id is not None:
        query = query.filter(models.User.id != exclude_user_id)
    result = await db.execute(query)
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="员工邮箱已被系统账户占用")


async def _assert_username_available(
    db: AsyncSession,
    *,
    username: str | None,
    exclude_user_id: int | None = None,
) -> None:
    normalized_username = str(username or "").strip()
    if not normalized_username:
        return
    query = select(models.User).filter(models.User.username == normalized_username)
    if exclude_user_id is not None:
        query = query.filter(models.User.id != exclude_user_id)
    result = await db.execute(query)
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="员工账号已被系统账户占用")


async def _load_user_map_by_accounts(
    db: AsyncSession,
    *,
    accounts: list[str],
) -> dict[str, models.User]:
    normalized_accounts = [str(account or "").strip() for account in accounts if str(account or "").strip()]
    if not normalized_accounts:
        return {}
    result = await db.execute(
        select(models.User).filter(models.User.username.in_(normalized_accounts))
    )
    return {
        str(user.username or "").strip(): user
        for user in result.scalars().all()
        if str(user.username or "").strip()
    }


async def _load_webauthn_user_ids(
    db: AsyncSession,
    *,
    user_ids: list[int],
) -> set[int]:
    normalized_user_ids = [int(user_id) for user_id in user_ids if user_id is not None]
    if not normalized_user_ids:
        return set()

    result = await db.execute(
        select(models.WebAuthnCredential.user_id)
        .filter(models.WebAuthnCredential.user_id.in_(normalized_user_ids))
        .distinct()
    )
    return {int(user_id) for user_id in result.scalars().all() if user_id is not None}


def _serialize_employee_with_user(
    employee: models.Employee,
    linked_user: models.User | None = None,
    webauthn_user_ids: set[int] | None = None,
) -> schemas.Employee:
    data = schemas.Employee.model_validate(employee)
    if linked_user is not None:
        totp_enabled = bool(linked_user.totp_enabled)
        email_mfa_enabled = bool(linked_user.email_mfa_enabled and str(linked_user.email or "").strip())
        webauthn_enabled = bool(linked_user.id and linked_user.id in (webauthn_user_ids or set()))
        data.email = str(linked_user.email or employee.email or "")
        data.auth_source = str(linked_user.auth_source or "local")
        data.totp_enabled = totp_enabled
        data.email_mfa_enabled = email_mfa_enabled
        data.webauthn_enabled = webauthn_enabled
        data.mfa_enabled = bool(totp_enabled or email_mfa_enabled or webauthn_enabled)
    return data

@app_router.get("/", response_model=List[schemas.Employee])
async def read_employees_for_portal(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """
    Portal-facing employee directory.
    Returns only active employees so frontend通讯录与“启用状态”一致。
    """
    result = await db.execute(
        select(models.Employee)
        .filter(models.Employee.status == "Active")
        .offset(skip)
        .limit(limit)
    )
    employees = result.scalars().all()
    user_map = await _load_user_map_by_accounts(db, accounts=[emp.account for emp in employees if emp.account])
    webauthn_user_ids = await _load_webauthn_user_ids(
        db,
        user_ids=[user.id for user in user_map.values() if getattr(user, "id", None) is not None],
    )
    return [
        _serialize_employee_with_user(
            emp,
            user_map.get(str(emp.account or "").strip()),
            webauthn_user_ids,
        )
        for emp in employees
    ]

@router.get("/", response_model=List[schemas.Employee])
async def read_employees(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(PermissionChecker("sys:user:view")),
):
    result = await db.execute(select(models.Employee).offset(skip).limit(limit))
    employees = result.scalars().all()

    user_map = await _load_user_map_by_accounts(db, accounts=[emp.account for emp in employees if emp.account])
    webauthn_user_ids = await _load_webauthn_user_ids(
        db,
        user_ids=[user.id for user in user_map.values() if getattr(user, "id", None) is not None],
    )
    return [
        _serialize_employee_with_user(
            emp,
            user_map.get(str(emp.account or "").strip()),
            webauthn_user_ids,
        )
        for emp in employees
    ]

@router.get("/{employee_id}", response_model=schemas.Employee)
async def read_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(PermissionChecker("sys:user:view")),
):
    result = await db.execute(select(models.Employee).filter(models.Employee.id == employee_id))
    employee = result.scalars().first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    linked_user = None
    webauthn_user_ids: set[int] = set()
    if employee.account:
        user_result = await db.execute(select(models.User).filter(models.User.username == employee.account))
        linked_user = user_result.scalars().first()
        if linked_user is not None and getattr(linked_user, "id", None) is not None:
            webauthn_user_ids = await _load_webauthn_user_ids(db, user_ids=[linked_user.id])
    return _serialize_employee_with_user(employee, linked_user, webauthn_user_ids)

@router.post("/", response_model=schemas.EmployeeCreateResult, status_code=status.HTTP_201_CREATED)
async def create_employee(
    request: Request,
    background_tasks: BackgroundTasks,
    employee: schemas.EmployeeCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("sys:user:edit"))
):
    # 1. Create Employee
    db_employee = models.Employee(**employee.dict())
    db.add(db_employee)
    
    # 2. Auto-provision portal login account (hidden from system-account UI by frontend filter)
    auto_provisioned = False
    portal_initial_password: str | None = None
    user_stmt = select(models.User).filter(models.User.username == employee.account)
    user_result = await db.execute(user_stmt)
    existing_user = user_result.scalars().first()

    if existing_user:
        account_type = (existing_user.account_type or "PORTAL").upper()
        if account_type != "PORTAL":
            raise HTTPException(
                status_code=400,
                detail=f"账户 {employee.account} 已存在且不是 PORTAL 身份，无法用于门户登录。"
            )
        await _assert_user_email_available(db, email=employee.email, exclude_user_id=existing_user.id)
        existing_user.is_active = (employee.status == "Active")
        existing_user.email = employee.email
        if not existing_user.name:
            existing_user.name = employee.name
        if employee.avatar:
            existing_user.avatar = employee.avatar
    else:
        configs = await get_password_policy_configs(db)
        await _assert_user_email_available(db, email=employee.email)
        user_email = employee.email

        policy_subject = models.User(username=employee.account, email=user_email)
        generated_password: str | None = None
        for _ in range(12):
            candidate = generate_compliant_password(configs)
            try:
                await validate_password(
                    db,
                    candidate,
                    policy_subject,
                    configs=configs,
                    check_history=False,
                )
                generated_password = candidate
                break
            except HTTPException as e:
                if e.status_code != 400:
                    raise
        if not generated_password:
            raise HTTPException(status_code=500, detail="无法生成符合密码策略的初始密码")
        portal_initial_password = generated_password

        new_user = models.User(
            username=employee.account,
            email=user_email,
            account_type="PORTAL",
            is_active=(employee.status == "Active"),
            name=employee.name,
            avatar=employee.avatar,
        )
        await set_user_password(
            db,
            new_user,
            portal_initial_password,
            validate=False,
            configs=configs,
        )

        role_result = await db.execute(
            select(models.Role).filter(
                models.Role.app_id == "portal",
                models.Role.code == "user",
            )
        )
        default_role = role_result.scalars().first()
        if default_role:
            new_user.roles = [default_role]

        db.add(new_user)
        auto_provisioned = True
        
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id, 
        username=current_user.username, 
        action="CREATE_EMPLOYEE", 
        target=f"用户:{db_employee.name}", 
        detail=f"auto_portal_account={'yes' if auto_provisioned else 'existing'}",
        ip_address=ip,
        trace_id=trace_id
    )
    
    await db.commit()
    await db.refresh(db_employee)
    return {
        "id": db_employee.id,
        "account": db_employee.account,
        "job_number": db_employee.job_number,
        "name": db_employee.name,
        "gender": db_employee.gender,
        "department": db_employee.department,
        "role": db_employee.role,
        "email": db_employee.email,
        "phone": db_employee.phone,
        "location": db_employee.location,
        "avatar": db_employee.avatar,
        "status": db_employee.status,
        "portal_initial_password": portal_initial_password,
        "portal_account_auto_created": auto_provisioned,
    }

@router.put("/{employee_id}", response_model=schemas.Employee)
async def update_employee(
    employee_id: int, 
    request: Request,
    background_tasks: BackgroundTasks,
    employee_update: schemas.EmployeeCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("sys:user:edit"))
):
    result = await db.execute(select(models.Employee).filter(models.Employee.id == employee_id))
    employee = result.scalars().first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    previous_account = str(employee.account or "").strip()
    previous_status = employee.status
    
    for key, value in employee_update.dict().items():
        setattr(employee, key, value)
    
    # Sync employee profile fields to linked portal user account.
    # Frontend profile avatar renders from /iam/auth/me (User.avatar), not Employee.avatar.
    if employee.account:
        candidate_accounts = [account for account in [previous_account, str(employee.account or "").strip()] if account]
        user_map = await _load_user_map_by_accounts(db, accounts=candidate_accounts)
        user = user_map.get(previous_account) or user_map.get(str(employee.account or "").strip())
        if user:
            await _assert_username_available(
                db,
                username=employee.account,
                exclude_user_id=user.id,
            )
            await _assert_user_email_available(
                db,
                email=employee.email,
                exclude_user_id=user.id,
            )
            user.username = employee.account
            user.email = employee.email
            user.is_active = (employee.status == "Active")
            user.name = employee.name
            user.avatar = employee.avatar
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="UPDATE_EMPLOYEE",
        target=f"用户:{employee.name}",
        detail=f"employee_id={employee_id}",
        ip_address=ip,
        trace_id=trace_id,
    )

    await db.commit()
    await db.refresh(employee)
    linked_user = None
    webauthn_user_ids: set[int] = set()
    if employee.account:
        user_result = await db.execute(select(models.User).filter(models.User.username == employee.account))
        linked_user = user_result.scalars().first()
        if linked_user is not None and getattr(linked_user, "id", None) is not None:
            webauthn_user_ids = await _load_webauthn_user_ids(db, user_ids=[linked_user.id])
    return _serialize_employee_with_user(employee, linked_user, webauthn_user_ids)

@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: int, 
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("sys:user:edit"))
):
    result = await db.execute(select(models.Employee).filter(models.Employee.id == employee_id))
    employee = result.scalars().first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # 级联删除关联的 User 记录（仅 PORTAL 类型，不影响 SYSTEM 管理员）
    linked_user = None
    if employee.account:
        user_result = await db.execute(
            select(models.User).filter(
                models.User.username == employee.account,
                models.User.account_type != "SYSTEM",
            )
        )
        linked_user = user_result.scalars().first()
    
    await db.delete(employee)
    if linked_user:
        # 清除没有 ondelete=CASCADE 的关联表记录
        await db.execute(sa_delete(models.UserPasswordHistory).where(models.UserPasswordHistory.user_id == linked_user.id))
        await db.execute(sa_delete(models.AnnouncementRead).where(models.AnnouncementRead.user_id == linked_user.id))
        await db.delete(linked_user)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id, 
        username=current_user.username, 
        action="DELETE_EMPLOYEE", 
        target=f"用户:{employee.name}", 
        detail=f"linked_user_deleted={'yes' if linked_user else 'no'}",
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()
    return None
