from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_db
import models, schemas, utils
from sqlalchemy import select, update, delete
from fastapi import Request
from services.audit_service import AuditService
from routers.auth import get_current_user
import uuid

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

@router.post("/", response_model=schemas.Employee, status_code=status.HTTP_201_CREATED)
async def create_employee(
    request: Request,
    employee: schemas.EmployeeCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # 1. Create Employee
    db_employee = models.Employee(**employee.dict())
    db.add(db_employee)
    
    # 2. Check and Create User credential if not exists
    # Use employee.account as username
    user_stmt = select(models.User).filter(models.User.username == employee.account)
    user_result = await db.execute(user_stmt)
    existing_user = user_result.scalars().first()
    
    if not existing_user:
        # Create default user
        default_pwd_hash = utils.get_password_hash("123456")
        new_user = models.User(
            username=employee.account,
            email=employee.email,
            hashed_password=default_pwd_hash,
            is_active=True
        )
        db.add(new_user)
        
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="CREATE_EMPLOYEE", 
        target=f"用户:{db_employee.name}", 
        ip_address=ip,
        trace_id=trace_id
    )
    
    await db.commit()
    await db.refresh(db_employee)
    return db_employee

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
