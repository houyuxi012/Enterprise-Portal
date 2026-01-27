from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_db
import models, schemas
from sqlalchemy import select, update, delete

router = APIRouter(
    prefix="/employees",
    tags=["employees"]
)

@router.get("/", response_model=List[schemas.Employee])
async def read_employees(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Employee).offset(skip).limit(limit))
    employees = result.scalars().all()
    return employees

@router.get("/{employee_id}", response_model=schemas.Employee)
async def read_employee(employee_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Employee).filter(models.Employee.id == employee_id))
    employee = result.scalars().first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee

@router.post("/", response_model=schemas.Employee, status_code=status.HTTP_201_CREATED)
async def create_employee(employee: schemas.EmployeeCreate, db: AsyncSession = Depends(get_db)):
    db_employee = models.Employee(**employee.dict())
    db.add(db_employee)
    await db.commit()
    await db.refresh(db_employee)
    return db_employee

@router.put("/{employee_id}", response_model=schemas.Employee)
async def update_employee(employee_id: int, employee_update: schemas.EmployeeCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Employee).filter(models.Employee.id == employee_id))
    employee = result.scalars().first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    for key, value in employee_update.dict().items():
        setattr(employee, key, value)
    
    await db.commit()
    await db.refresh(employee)
    return employee

@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(employee_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Employee).filter(models.Employee.id == employee_id))
    employee = result.scalars().first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    await db.delete(employee)
    await db.commit()
    return None
