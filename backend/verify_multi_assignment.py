import asyncio
from sqlalchemy import select
from database import SessionLocal
from models import Todo, User, Department, Employee
from routers.todos import _apply_task_filters, _resolve_user_dept_id

async def verify():
    async with SessionLocal() as db:
        # Get Sarah
        res = await db.execute(select(User).filter_by(username="sarah"))
        sarah = res.scalar_one_or_none()
        
        # Get Sarah's department ID
        sarah_dept_id = await _resolve_user_dept_id(db, sarah.username)
        print(f"Sarah's Dept ID: {sarah_dept_id}")
        
        # Create a task assigned to Sarah's department
        if sarah_dept_id:
            dept_res = await db.execute(select(Department).filter_by(id=sarah_dept_id))
            dept = dept_res.scalar_one()
            
            todo = Todo(
                title="Department Task for Sarah's Dept",
                description="Test Dept Assignment",
                status="pending",
                priority=1,
                creator_id=sarah.id
            )
            todo.assigned_departments.append(dept)
            db.add(todo)
            await db.commit()
            print("Created a task assigned to Sarah's department.")
        
        # Now use the filter logic to get Sarah's tasks
        query = _apply_task_filters(
            select(Todo),
            user_id=sarah.id,
            user_dept_id=sarah_dept_id,
            status=None,
            priority=None,
            q=None,
            preset="my"
        )
        
        tasks_res = await db.execute(query)
        tasks = tasks_res.scalars().unique().all()
        
        print(f"Sarah sees {len(tasks)} tasks.")
        for t in tasks:
            print(f"- {t.title} (Users: {[u.username for u in t.assigned_users]}, Depts: {[d.name for d in t.assigned_departments]})")

if __name__ == "__main__":
    asyncio.run(verify())
