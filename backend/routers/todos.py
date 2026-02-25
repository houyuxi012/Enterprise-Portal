from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, case
from typing import Optional

from database import get_db
import models, schemas
from dependencies import get_current_user
from services.audit_service import AuditService

router = APIRouter(
    prefix="/tasks",
    tags=["tasks"]
)


from sqlalchemy.orm import selectinload

async def _resolve_user_dept_id(db: AsyncSession, username: str) -> Optional[int]:
    emp_result = await db.execute(select(models.Employee).filter(models.Employee.account == username))
    employee = emp_result.scalars().first()
    if employee and employee.department:
        dept_result = await db.execute(select(models.Department).filter(models.Department.name == employee.department))
        dept = dept_result.scalars().first()
        return dept.id if dept else None
    return None

def _apply_task_filters(
    query,
    user_id: int,
    user_dept_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[int] = None,
    q: Optional[str] = None,
    preset: Optional[str] = None,
):
    access_condition = models.Todo.creator_id == user_id
    access_condition = or_(access_condition, models.Todo.assigned_users.any(models.User.id == user_id))
    if user_dept_id:
        access_condition = or_(access_condition, models.Todo.assigned_departments.any(models.Department.id == user_dept_id))
    
    query = query.filter(access_condition)

    if status:
        query = query.filter(models.Todo.status == status)
    if priority is not None:
        query = query.filter(models.Todo.priority == priority)
    if q:
        query = query.filter(or_(
            models.Todo.title.ilike(f"%{q}%"),
            models.Todo.description.ilike(f"%{q}%")
        ))
    if preset == "urgent":
        query = query.filter(models.Todo.priority == 0)
    return query


@router.get("/stats", response_model=schemas.TodoStatsResponse)
async def get_my_task_stats(
    scope: str = Query("active", pattern="^(active|all)$"),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    base_query = select(
        func.count(models.Todo.id).label("total"),
        func.coalesce(func.sum(case((models.Todo.priority == 0, 1), else_=0)), 0).label("emergency"),
        func.coalesce(func.sum(case((models.Todo.priority == 1, 1), else_=0)), 0).label("high"),
        func.coalesce(func.sum(case((models.Todo.priority == 2, 1), else_=0)), 0).label("medium"),
        func.coalesce(func.sum(case((models.Todo.priority == 3, 1), else_=0)), 0).label("low"),
        func.coalesce(
            func.sum(
                case(
                    (
                        or_(
                            models.Todo.priority.is_(None),
                            models.Todo.priority.notin_([0, 1, 2, 3]),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ).label("unclassified"),
        func.coalesce(func.sum(case((models.Todo.status == "pending", 1), else_=0)), 0).label("pending"),
        func.coalesce(func.sum(case((models.Todo.status == "in_progress", 1), else_=0)), 0).label("in_progress"),
        func.coalesce(func.sum(case((models.Todo.status == "completed", 1), else_=0)), 0).label("completed"),
        func.coalesce(func.sum(case((models.Todo.status == "canceled", 1), else_=0)), 0).label("canceled"),
    )
    
    user_dept_id = await _resolve_user_dept_id(db, current_user.username)
    access_condition = models.Todo.creator_id == current_user.id
    access_condition = or_(access_condition, models.Todo.assigned_users.any(models.User.id == current_user.id))
    if user_dept_id:
        access_condition = or_(access_condition, models.Todo.assigned_departments.any(models.Department.id == user_dept_id))
        
    base_query = base_query.filter(access_condition)

    if scope == "active":
        base_query = base_query.filter(models.Todo.status.in_(["pending", "in_progress"]))

    result = await db.execute(base_query)
    row = result.mappings().one()

    return {
        "scope": scope,
        "total": int(row["total"] or 0),
        "emergency": int(row["emergency"] or 0),
        "high": int(row["high"] or 0),
        "medium": int(row["medium"] or 0),
        "low": int(row["low"] or 0),
        "unclassified": int(row["unclassified"] or 0),
        "pending": int(row["pending"] or 0),
        "in_progress": int(row["in_progress"] or 0),
        "completed": int(row["completed"] or 0),
        "canceled": int(row["canceled"] or 0),
    }

@router.get("/", response_model=schemas.PaginatedTodoResponse)
async def get_my_tasks(
    status: Optional[str] = None,
    priority: Optional[int] = None,
    q: Optional[str] = None,
    preset: Optional[str] = None, # today, week, urgent
    sort: Optional[str] = "priority",
    order: Optional[str] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get current user's tasks with pagination and filtering.
    """
    user_dept_id = await _resolve_user_dept_id(db, current_user.username)
    
    query = _apply_task_filters(
        select(models.Todo).options(
            selectinload(models.Todo.assigned_users),
            selectinload(models.Todo.assigned_departments),
            selectinload(models.Todo.creator)
        ),
        user_id=current_user.id,
        user_dept_id=user_dept_id,
        status=status,
        priority=priority,
        q=q,
        preset=preset,
    )

    # Sorting
    sort_column = getattr(models.Todo, sort, models.Todo.priority)
    
    # Special handling for priority sort to ensure 0 comes first (asc)
    # But if sort is 'created_at', we might want desc default.
    # The default params are now priority/asc.
    
    if order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())
        
    # Secondary sort: always created_at desc (newest first) for equal primary sort values
    if sort != "created_at":
        query = query.order_by(models.Todo.created_at.desc())

    # Doing the query with limit/offset
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()
    
    count_q = _apply_task_filters(
        select(func.count(models.Todo.id)),
        user_id=current_user.id,
        user_dept_id=user_dept_id,
        status=status,
        priority=priority,
        q=q,
        preset=preset,
    )
    count_res = await db.execute(count_q)
    total = count_res.scalar() or 0

    # Enrich names
    for todo in items:
        todo.creator_name = todo.creator.name or todo.creator.username if todo.creator else "System"

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.post("/", response_model=schemas.Todo, status_code=status.HTTP_201_CREATED)
async def create_task(
    request: Request,
    todo_in: schemas.TodoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_todo = models.Todo(
        title=todo_in.title,
        description=todo_in.description,
        status="pending",
        priority=todo_in.priority if todo_in.priority is not None else 2,
        due_at=todo_in.due_at,
        creator_id=current_user.id
    )
    
    if todo_in.assignee_user_ids:
        users = await db.execute(select(models.User).filter(models.User.id.in_(todo_in.assignee_user_ids)))
        db_todo.assigned_users = list(users.scalars().all())
    elif not todo_in.assignee_dept_ids:
        # Default to self if no assignees are provided
        db_todo.assigned_users = [current_user]
        
    if todo_in.assignee_dept_ids:
        depts = await db.execute(select(models.Department).filter(models.Department.id.in_(todo_in.assignee_dept_ids)))
        db_todo.assigned_departments = list(depts.scalars().all())
    
    db.add(db_todo)
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(models.Todo)
        .options(selectinload(models.Todo.assigned_users), selectinload(models.Todo.assigned_departments), selectinload(models.Todo.creator))
        .filter(models.Todo.id == db_todo.id)
    )
    db_todo = result.scalars().first()
    if db_todo.creator:
        db_todo.creator_name = db_todo.creator.name or db_todo.creator.username
    
    # Audit Log
    await AuditService.log_business_action(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="CREATE_TASK",
        target=f"task:{db_todo.id}",
        detail=f"Created task: {db_todo.title}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID")
    )
    
    await db.commit()
    return db_todo

@router.patch("/{task_id}/", response_model=schemas.Todo)
async def update_task(
    task_id: int,
    request: Request,
    todo_update: schemas.TodoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    user_dept_id = await _resolve_user_dept_id(db, current_user.username)
    
    access_condition = models.Todo.creator_id == current_user.id
    access_condition = or_(access_condition, models.Todo.assigned_users.any(models.User.id == current_user.id))
    if user_dept_id:
        access_condition = or_(access_condition, models.Todo.assigned_departments.any(models.Department.id == user_dept_id))

    result = await db.execute(
        select(models.Todo)
        .options(selectinload(models.Todo.assigned_users), selectinload(models.Todo.assigned_departments), selectinload(models.Todo.creator))
        .filter(models.Todo.id == task_id, access_condition)
    )
    todo = result.scalars().first()
    
    if not todo:
        raise HTTPException(status_code=404, detail="Task not found")
        
    update_data = todo_update.dict(exclude_unset=True)
    
    if 'assignee_user_ids' in update_data:
        users = await db.execute(select(models.User).filter(models.User.id.in_(update_data['assignee_user_ids'])))
        todo.assigned_users = list(users.scalars().all())
        del update_data['assignee_user_ids']
        
    if 'assignee_dept_ids' in update_data:
        depts = await db.execute(select(models.Department).filter(models.Department.id.in_(update_data['assignee_dept_ids'])))
        todo.assigned_departments = list(depts.scalars().all())
        del update_data['assignee_dept_ids']
        
    for key, value in update_data.items():
        setattr(todo, key, value)
        
    await AuditService.log_business_action(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="UPDATE_TASK",
        target=f"task:{todo.id}",
        detail=f"Updated task: {list(update_data.keys())}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID")
    )
    
    await db.commit()
    
    result = await db.execute(
        select(models.Todo)
        .options(selectinload(models.Todo.assigned_users), selectinload(models.Todo.assigned_departments), selectinload(models.Todo.creator))
        .filter(models.Todo.id == todo.id)
    )
    todo = result.scalars().first()
    if todo.creator:
        todo.creator_name = todo.creator.name or todo.creator.username
        
    return todo

# State Actions
@router.post("/{task_id}/complete/", response_model=schemas.Todo)
async def complete_task(task_id: int, request: Request, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return await _update_status(task_id, "completed", request, db, current_user)

@router.post("/{task_id}/reopen/", response_model=schemas.Todo)
async def reopen_task(task_id: int, request: Request, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return await _update_status(task_id, "pending", request, db, current_user)

@router.post("/{task_id}/cancel/", response_model=schemas.Todo)
async def cancel_task(task_id: int, request: Request, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return await _update_status(task_id, "canceled", request, db, current_user)

async def _update_status(task_id: int, status_val: str, request: Request, db: AsyncSession, current_user: models.User):
    user_dept_id = await _resolve_user_dept_id(db, current_user.username)
    access_condition = models.Todo.creator_id == current_user.id
    access_condition = or_(access_condition, models.Todo.assigned_users.any(models.User.id == current_user.id))
    if user_dept_id:
        access_condition = or_(access_condition, models.Todo.assigned_departments.any(models.Department.id == user_dept_id))

    result = await db.execute(
        select(models.Todo)
        .options(selectinload(models.Todo.assigned_users), selectinload(models.Todo.assigned_departments), selectinload(models.Todo.creator))
        .filter(models.Todo.id == task_id, access_condition)
    )
    todo = result.scalars().first()
    if not todo: raise HTTPException(status_code=404, detail="Task not found")
    
    todo.status = status_val
    await AuditService.log_business_action(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="CHANGE_TASK_STATUS",
        target=f"task:{todo.id}",
        detail=f"Changed status to {status_val}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID")
    )
    await db.commit()
    
    result = await db.execute(
        select(models.Todo)
        .options(selectinload(models.Todo.assigned_users), selectinload(models.Todo.assigned_departments), selectinload(models.Todo.creator))
        .filter(models.Todo.id == todo.id)
    )
    todo = result.scalars().first()
    if todo.creator:
        todo.creator_name = todo.creator.name or todo.creator.username
    return todo
