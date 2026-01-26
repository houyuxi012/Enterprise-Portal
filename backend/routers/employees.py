from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import database, models, schemas
from sqlalchemy import select

router = APIRouter(
    prefix="/employees",
    tags=["employees"]
)

from routers.auth import get_current_active_admin
from fastapi import status

@router.get("/", response_model=List[schemas.Employee])
async def read_employees(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.Employee).offset(skip).limit(limit))
    employees = result.scalars().all()
    return employees

@router.post("/", response_model=schemas.Employee)
async def create_employee(
    employee: schemas.EmployeeCreate, 
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_admin)
):
    db_employee = models.Employee(**employee.dict())
    db.add(db_employee)
    await db.commit()
    await db.refresh(db_employee)
    return db_employee

@router.put("/{employee_id}", response_model=schemas.Employee)
async def update_employee(
    employee_id: int,
    employee: schemas.EmployeeUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_admin)
):
    result = await db.execute(select(models.Employee).where(models.Employee.id == employee_id))
    db_employee = result.scalars().first()
    if db_employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    for key, value in employee.dict().items():
        setattr(db_employee, key, value)
        
    await db.commit()
    await db.refresh(db_employee)
    return db_employee

@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_admin)
):
    result = await db.execute(select(models.Employee).where(models.Employee.id == employee_id))
    db_employee = result.scalars().first()
    if db_employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    await db.delete(db_employee)
    await db.commit()
    return None
