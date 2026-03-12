from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime

from core.database import get_db
import modules.models as models
import modules.schemas as schemas
from core.dependencies import PermissionChecker, get_current_user
from application.admin_app import AuditService

router = APIRouter(
    prefix="/tasks",
    tags=["admin_tasks"]
)

@router.get("/", response_model=schemas.PaginatedTodoResponse)
async def get_all_tasks(
    assignee_user_id: Optional[int] = None,
    assignee_dept_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(PermissionChecker("todo:admin"))
):
    """
    Get all tasks (Admin only) with pagination.
    """
    query = select(models.Todo).options(
        selectinload(models.Todo.assigned_users),
        selectinload(models.Todo.assigned_departments),
        selectinload(models.Todo.creator)
    )
    
    if assignee_user_id:
        query = query.filter(models.Todo.assigned_users.any(models.User.id == assignee_user_id))
    if assignee_dept_id:
        query = query.filter(models.Todo.assigned_departments.any(models.Department.id == assignee_dept_id))
        
    if status:
        query = query.filter(models.Todo.status == status)
        
    query = query.order_by(models.Todo.created_at.desc())
    
    # Pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    # Map names
    for todo in items:
        if todo.creator:
            todo.creator_name = todo.creator.name or todo.creator.username
            
    # Count
    count_q = select(models.Todo)
    if assignee_user_id:
        count_q = count_q.filter(models.Todo.assigned_users.any(models.User.id == assignee_user_id))
    if assignee_dept_id:
        count_q = count_q.filter(models.Todo.assigned_departments.any(models.Department.id == assignee_dept_id))
    if status:
        count_q = count_q.filter(models.Todo.status == status)
        
    count_res = await db.execute(count_q)
    total = len(count_res.scalars().all())
            
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.post("/", response_model=schemas.Todo, status_code=status.HTTP_201_CREATED)
async def admin_create_task(
    request: Request,
    background_tasks: BackgroundTasks,
    todo_in: schemas.TodoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("todo:admin")) # Returns user actually
):
    """
    Create a task assigned to anyone (Admin only).
    """
    if not todo_in.assignee_user_ids and not todo_in.assignee_dept_ids:
        raise HTTPException(status_code=400, detail="assignee_user_ids or assignee_dept_ids is required for admin task creation")

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
    if todo_in.assignee_dept_ids:
        depts = await db.execute(select(models.Department).filter(models.Department.id.in_(todo_in.assignee_dept_ids)))
        db_todo.assigned_departments = list(depts.scalars().all())
    
    db.add(db_todo)
    await db.commit()
    
    # Populate names for response
    result = await db.execute(
        select(models.Todo)
        .options(selectinload(models.Todo.assigned_users), selectinload(models.Todo.assigned_departments), selectinload(models.Todo.creator))
        .filter(models.Todo.id == db_todo.id)
    )
    db_todo = result.scalars().first()
    
    if db_todo.creator:
        db_todo.creator_name = db_todo.creator.name or db_todo.creator.username
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="ADMIN_CREATE_TASK",
        target=f"task:{db_todo.id}",
        detail=(
            f"title={db_todo.title}, assigned_users={len(todo_in.assignee_user_ids or [])}, "
            f"assigned_departments={len(todo_in.assignee_dept_ids or [])}"
        ),
        ip_address=ip,
        trace_id=trace_id,
        domain="BUSINESS",
    )
    return db_todo

@router.patch("/{task_id}/", response_model=schemas.Todo)
async def admin_update_task(
    task_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    todo_update: schemas.TodoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("todo:admin"))
):
    """
    Update any task (Admin only).
    """
    result = await db.execute(
        select(models.Todo)
        .options(selectinload(models.Todo.assigned_users), selectinload(models.Todo.assigned_departments), selectinload(models.Todo.creator))
        .filter(models.Todo.id == task_id)
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

    await db.commit()
        
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="ADMIN_UPDATE_TASK",
        target=f"task:{todo.id}",
        detail=f"Admin updated task: {list(update_data.keys())}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    
    result = await db.execute(
        select(models.Todo)
        .options(selectinload(models.Todo.assigned_users), selectinload(models.Todo.assigned_departments), selectinload(models.Todo.creator))
        .filter(models.Todo.id == todo.id)
    )
    todo = result.scalars().first()
    
    if todo.creator:
        todo.creator_name = todo.creator.name or todo.creator.username
        
    return todo

@router.delete("/{task_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_task(
    task_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("todo:admin"))
):
    """
    Delete any task (Admin only).
    """
    result = await db.execute(select(models.Todo).filter(models.Todo.id == task_id))
    todo = result.scalars().first()
    
    if not todo:
        raise HTTPException(status_code=404, detail="Task not found")
        
    await db.delete(todo)
    await db.commit()
    
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="ADMIN_DELETE_TASK",
        target=f"task:{task_id}",
        detail=f"Admin deleted task: {todo.title}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
