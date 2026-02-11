from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime

from database import get_db
import models, schemas
from dependencies import PermissionChecker, get_current_user
from services.audit_service import AuditService

router = APIRouter(
    prefix="/tasks",
    tags=["admin_tasks"]
)

@router.get("/", response_model=schemas.PaginatedTodoResponse)
async def get_all_tasks(
    assignee_id: Optional[int] = None,
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
        selectinload(models.Todo.assignee),
        selectinload(models.Todo.creator)
    )
    
    if assignee_id:
        query = query.filter(models.Todo.assignee_id == assignee_id)
        
    if status:
        query = query.filter(models.Todo.status == status)
        
    query = query.order_by(models.Todo.created_at.desc())
    
    # Pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    # Map names
    for todo in items:
        if todo.assignee:
            todo.assignee_name = todo.assignee.name or todo.assignee.username
        if todo.creator:
            todo.creator_name = todo.creator.name or todo.creator.username
            
    # Count
    count_q = select(models.Todo)
    if assignee_id:
        count_q = count_q.filter(models.Todo.assignee_id == assignee_id)
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
    todo_in: schemas.TodoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("todo:admin")) # Returns user actually
):
    """
    Create a task assigned to anyone (Admin only).
    """
    if not todo_in.assignee_id:
        raise HTTPException(status_code=400, detail="assignee_id is required for admin task creation")

    db_todo = models.Todo(
        title=todo_in.title,
        description=todo_in.description,
        status="pending",
        priority=todo_in.priority if todo_in.priority is not None else 2,
        due_at=todo_in.due_at,
        assignee_id=todo_in.assignee_id,
        creator_id=current_user.id
    )
    
    db.add(db_todo)
    await db.commit()
    await db.refresh(db_todo)
    
    # Populate names for response
    result = await db.execute(
        select(models.Todo)
        .options(selectinload(models.Todo.assignee), selectinload(models.Todo.creator))
        .filter(models.Todo.id == db_todo.id)
    )
    db_todo = result.scalars().first()
    
    if db_todo.assignee:
        db_todo.assignee_name = db_todo.assignee.name or db_todo.assignee.username
    if db_todo.creator:
        db_todo.creator_name = db_todo.creator.name or db_todo.creator.username
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="ADMIN_CREATE_TASK",
        target=f"task:{db_todo.id}",
        detail=f"Created task for user {todo_in.assignee_id}: {db_todo.title}",
        ip_address=ip,
        trace_id=trace_id
    )
    
    await db.commit()
    return db_todo

@router.patch("/{task_id}/", response_model=schemas.Todo)
async def admin_update_task(
    task_id: int,
    request: Request,
    todo_update: schemas.TodoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("todo:admin"))
):
    """
    Update any task (Admin only).
    """
    result = await db.execute(
        select(models.Todo)
        .options(selectinload(models.Todo.assignee), selectinload(models.Todo.creator))
        .filter(models.Todo.id == task_id)
    )
    todo = result.scalars().first()
    
    if not todo:
        raise HTTPException(status_code=404, detail="Task not found")
        
    update_data = todo_update.dict(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(todo, key, value)
        
    await AuditService.log_business_action(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="ADMIN_UPDATE_TASK",
        target=f"task:{todo.id}",
        detail=f"Admin updated task: {list(update_data.keys())}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID")
    )
    
    await db.commit()
    await db.refresh(todo)
    
    if todo.assignee:
        todo.assignee_name = todo.assignee.name or todo.assignee.username
    if todo.creator:
        todo.creator_name = todo.creator.name or todo.creator.username
        
    return todo

@router.delete("/{task_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_task(
    task_id: int,
    request: Request,
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
    
    await AuditService.log_business_action(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="ADMIN_DELETE_TASK",
        target=f"task:{task_id}",
        detail=f"Admin deleted task: {todo.title}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID")
    )
    
    await db.commit()
