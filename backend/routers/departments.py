from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import models
import schemas
from database import get_db
from fastapi import Request
from services.audit_service import AuditService
from dependencies import PermissionChecker

router = APIRouter(
    prefix="/departments",
    tags=["departments"],
    responses={404: {"description": "Not found"}},
)

async def build_department_tree(departments: List[models.Department], parent_id: int = None) -> List[dict]:
    """
    Recursively build tree structure
    Note: Current implementation assumes 'departments' list contains all, or we fetch recursively.
    Better approach for ORM is sending flat list and letting frontend build tree, OR
    using eager loading for children.
    Here strictly for API response 'children' field, we rely on Pydantic and ORM relationship.
    """
    # If we use ORM 'children' relationship with selectinload, it handles recursion.
    return []

@router.get("/", response_model=List[schemas.Department])
async def read_departments(
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(PermissionChecker("sys:user:view")),
):
    # Fetch only root departments, but load children recursively
    # Recursion with asyncio selectinload works if configured
    # For simplicity if tree is not huge: Fetch ALL and let Pydantic or Frontend helper build tree?
    # Schema Department defines children: List['Department']
    # If we return roots, and they have .children loaded, Pydantic serializes tree.
    
    # We need to eagerly load children. Adjacency list loading.
    # To load arbitrary depth, we can configure loader options or just fetch all and stitch in memory.
    # Let's try fetching roots with selectinload for 1-2 levels, or just fetch all and return flat?
    # Actually, fetching roots and letting ORM lazy load in async is bad (implict IO).
    # Best practice for async tree: Fetch all flattened, return flattened, let frontend build tree.
    # BUT, to match Pydantic schema structure (nested), we must stitch result.
    
    # Alternative: Return Flat list, verify Schema is compatible.
    # If Schema expects 'children', we must populate it.
    
    # Strategy: Fetch all departments, build tree in memory, return roots.
    # Strategy: Fetch all departments, build tree in memory using Pydantic models/dicts to avoid async lazy load issues.
    result = await db.execute(select(models.Department).order_by(models.Department.id))
    all_depts = result.scalars().all()
    
    # Convert to schema models (Pydantic) immediately to detach from session and avoid lazy loading triggers
    # We use a custom Pydantic construction because from_orm might try to access .children if it's in the schema default
    # but initially children is empty in DB.
    # A safer way: Convert to dicts, then reconstruct.
    
    dept_map = {}
    roots = []
    
    # helper to convert model to dict safe for Pydantic
    def model_to_dict(d):
        return {
            "id": d.id,
            "name": d.name,
            "parent_id": d.parent_id,
            "manager": d.manager,
            "description": d.description,
            "sort_order": d.sort_order,
            "children": []
        }

    # First pass: Create dicts
    for d in all_depts:
        dept_map[d.id] = model_to_dict(d)
        
    # Second pass: Link children
    for d_id, d_dict in dept_map.items():
        if d_dict["parent_id"] and d_dict["parent_id"] in dept_map:
            parent = dept_map[d_dict["parent_id"]]
            parent["children"].append(d_dict)
        else:
            roots.append(d_dict)
            
    # Pydantic will validate the list of dicts against List[schemas.Department]
    return roots

@router.post("/", response_model=schemas.Department)
async def create_department(
    request: Request,
    dept: schemas.DepartmentCreate, 
    db: AsyncSession = Depends(get_db), 
    current_user: models.User = Depends(PermissionChecker("sys:user:edit"))
):
    db_dept = models.Department(**dept.dict())
    db.add(db_dept)
    await db.commit()
    await db.refresh(db_dept)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="CREATE_DEPARTMENT",
        target=f"部门:{db_dept.name}",
        detail=f"department_id={db_dept.id}, parent_id={db_dept.parent_id}",
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()
    
    # Manually construct response to avoid lazy loading 'children'
    # We use the Schema model directly
    return schemas.Department(
        id=db_dept.id,
        name=db_dept.name,
        parent_id=db_dept.parent_id,
        manager=db_dept.manager,
        description=db_dept.description,
        sort_order=db_dept.sort_order,
        children=[] # Explicitly empty for new node
    )

@router.put("/{dept_id}", response_model=schemas.Department)
async def update_department(
    dept_id: int, 
    request: Request,
    dept: schemas.DepartmentUpdate, 
    db: AsyncSession = Depends(get_db), 
    current_user: models.User = Depends(PermissionChecker("sys:user:edit"))
):
    result = await db.execute(select(models.Department).filter(models.Department.id == dept_id))
    db_dept = result.scalars().first()
    if not db_dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    for key, value in dept.dict(exclude_unset=True).items():
        setattr(db_dept, key, value)

    await db.commit()
    await db.refresh(db_dept)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="UPDATE_DEPARTMENT",
        target=f"部门:{db_dept.name}",
        detail=f"department_id={db_dept.id}",
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()
    
    # Return manually constructed Schema to avoid implicit lazy load of children
    return schemas.Department(
        id=db_dept.id,
        name=db_dept.name,
        parent_id=db_dept.parent_id,
        manager=db_dept.manager,
        description=db_dept.description,
        sort_order=db_dept.sort_order,
        children=[] # We return empty children for update response too, assuming UI refresh
    )

@router.delete("/{dept_id}")
async def delete_department(
    dept_id: int, 
    request: Request,
    db: AsyncSession = Depends(get_db), 
    current_user: models.User = Depends(PermissionChecker("sys:user:edit"))
):
    # Check existence
    result = await db.execute(select(models.Department).filter(models.Department.id == dept_id))
    db_dept = result.scalars().first()
    if not db_dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Check for children
    child_check = await db.execute(select(models.Department).filter(models.Department.parent_id == dept_id))
    children = child_check.scalars().all()
    if children:
        raise HTTPException(status_code=400, detail=f"Cannot delete: Contains {len(children)} sub-departments")
        
    # Check for employees
    emp_check = await db.execute(select(models.Employee).filter(models.Employee.department == db_dept.name))
    employees = emp_check.scalars().all()
    if employees:
         raise HTTPException(status_code=400, detail=f"Cannot delete: Department has {len(employees)} assigned employees")

    # Use Core Delete to avoid potential async ORM relationship loading issues
    from sqlalchemy import delete
    await db.execute(delete(models.Department).where(models.Department.id == dept_id))
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="DELETE_DEPARTMENT", 
        target=f"部门:{db_dept.name}", 
        ip_address=ip,
        trace_id=trace_id
    )
    
    await db.commit()
    
    return {"message": "Department deleted"}
