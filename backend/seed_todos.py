import asyncio
import logging
from datetime import datetime, timedelta
from database import SessionLocal
import models
from sqlalchemy import select, delete

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def seed_todos():
    async with SessionLocal() as db:
        # 1. Get a user
        # Try to find 'admin' first, or just the first user
        result = await db.execute(select(models.User).order_by(models.User.id))
        user = result.scalars().first()
        
        if not user:
            logger.error("No users found. Please login and create a user first via the app.")
            return
            
        logger.info(f"Seeding todos for user: {user.username} (ID: {user.id})")

        # 2. Clear existing todos for this user to ensure clean state
        logger.info("Clearing existing todos...")
        await db.execute(delete(models.Todo).where(models.Todo.assignee_id == user.id))
        await db.commit()
        
        # 3. Create Todos
        todos_data = [
            # Emergency (0) - 2 Pending
            {"title": "Fix critical bug in production", "priority": 0, "status": "pending", "due_at": datetime.utcnow() + timedelta(hours=1)},
            {"title": "Server downtime investigation", "priority": 0, "status": "pending", "due_at": datetime.utcnow() + timedelta(hours=2)},
            
            # High (1) - 2 Pending, 1 In Progress
            {"title": "Prepare Q3 financial report", "priority": 1, "status": "pending", "due_at": datetime.utcnow() + timedelta(days=1)},
            {"title": "Client meeting preparation", "priority": 1, "status": "pending", "due_at": datetime.utcnow() + timedelta(days=2)},
            {"title": "Security audit review", "priority": 1, "status": "in_progress", "due_at": datetime.utcnow() + timedelta(days=1)},
            
            # Medium (2) - 3 Pending, 2 Completed
            {"title": "Update documentation", "priority": 2, "status": "pending", "due_at": datetime.utcnow() + timedelta(days=3)},
            {"title": "Code review for PR #123", "priority": 2, "status": "pending", "due_at": datetime.utcnow() + timedelta(days=3)},
            {"title": "Weekly team sync", "priority": 2, "status": "pending", "due_at": datetime.utcnow() + timedelta(days=4)},
            {"title": "Email cleanup", "priority": 2, "status": "completed", "due_at": datetime.utcnow() - timedelta(days=1)},
            {"title": "Update software packages", "priority": 2, "status": "completed", "due_at": datetime.utcnow() - timedelta(days=2)},
            
            # Low (3) - 2 Pending
            {"title": "Organize desk", "priority": 3, "status": "pending", "due_at": datetime.utcnow() + timedelta(days=7)},
            {"title": "Read technical article", "priority": 3, "status": "pending", "due_at": datetime.utcnow() + timedelta(days=5)},
        ]
        
        for item in todos_data:
            todo = models.Todo(
                title=item["title"],
                description=f"Description for {item['title']} (Priority: {item['priority']})",
                status=item["status"],
                priority=item["priority"],
                due_at=item["due_at"],
                assignee_id=user.id,
                creator_id=user.id,
                created_at=datetime.utcnow()
            )
            db.add(todo)
            
        await db.commit()
        logger.info(f"Successfully added {len(todos_data)} todos.")

if __name__ == "__main__":
    asyncio.run(seed_todos())
