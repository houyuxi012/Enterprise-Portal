from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_db
import models, schemas, utils
from sqlalchemy import select, update, delete
from fastapi import Request
from services.audit_service import AuditService
from routers.auth import get_current_user

router = APIRouter(
    prefix="/employees",
    tags=["employees"]
)

@router.get("/", response_model=List[schemas.Employee])
async def read_employees(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    result = await db.execute(select(models.Employee).offset(skip).limit(limit))
    employees = result.scalars().all()
    return employees

@router.get("/{employee_id}", response_model=schemas.Employee)
async def read_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    result = await db.execute(select(models.Employee).filter(models.Employee.id == employee_id))
    employee = result.scalars().first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee

@router.post("/", response_model=schemas.EmployeeCreateResult, status_code=status.HTTP_201_CREATED)
async def create_employee(
    request: Request,
    employee: schemas.EmployeeCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
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
        existing_user.is_active = (employee.status == "Active")
        if not existing_user.name:
            existing_user.name = employee.name
        if employee.avatar:
            existing_user.avatar = employee.avatar
    else:
        config_result = await db.execute(select(models.SystemConfig))
        configs = {c.key: c.value for c in config_result.scalars().all()}
        min_length = int(configs.get("security_password_min_length", 8))
        base_password = "Portal#1234"
        default_password = (
            base_password
            if len(base_password) >= min_length
            else base_password + ("0" * (min_length - len(base_password)))
        )
        portal_initial_password = default_password

        user_email = employee.email
        email_result = await db.execute(select(models.User).filter(models.User.email == employee.email))
        email_conflict = email_result.scalars().first()
        if email_conflict:
            user_email = None

        new_user = models.User(
            username=employee.account,
            email=user_email,
            hashed_password=utils.get_password_hash(default_password),
            account_type="PORTAL",
            is_active=(employee.status == "Active"),
            name=employee.name,
            avatar=employee.avatar,
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
    await AuditService.log_business_action(
        db, 
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
    employee_update: schemas.EmployeeCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.Employee).filter(models.Employee.id == employee_id))
    employee = result.scalars().first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    previous_status = employee.status
    
    for key, value in employee_update.dict().items():
        setattr(employee, key, value)
    
    # Check for status change and sync with User.is_active
    if employee.status != previous_status and employee.account:
         user_result = await db.execute(select(models.User).filter(models.User.username == employee.account))
         user = user_result.scalars().first()
         if user:
             user.is_active = (employee.status == "Active")
             # Log the sync action
             # await AuditService.log_system_event(db, "SYNC_USER_STATUS", f"Synced user {user.username} status to {user.is_active}")
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db,
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
    return employee

@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: int, 
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.Employee).filter(models.Employee.id == employee_id))
    employee = result.scalars().first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    await db.delete(employee)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="DELETE_EMPLOYEE", 
        target=f"用户:{employee.name}", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()
    return None
