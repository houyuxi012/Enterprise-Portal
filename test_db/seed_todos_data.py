import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from database import SessionLocal
from models import Todo, User

SEED_MARKER = "[seed-todo]"

TODO_TEMPLATES = [
    {"title": "处理生产紧急告警", "priority": 0, "status": "pending", "due_hours": 2},
    {"title": "核心接口故障排查", "priority": 0, "status": "in_progress", "due_hours": 4},
    {"title": "准备季度经营复盘", "priority": 1, "status": "pending", "due_days": 1},
    {"title": "重要客户会议准备", "priority": 1, "status": "in_progress", "due_days": 2},
    {"title": "更新项目文档", "priority": 2, "status": "pending", "due_days": 3},
    {"title": "跨部门周会纪要", "priority": 2, "status": "completed", "due_days": -1},
    {"title": "历史任务归档清理", "priority": 2, "status": "canceled", "due_days": -2},
    {"title": "学习新技术方案", "priority": 3, "status": "pending", "due_days": 5},
    {"title": "整理知识库标签", "priority": 3, "status": "completed", "due_days": -3},
    {"title": "优化个人工作台布局", "priority": 3, "status": "pending", "due_days": 7},
]


def _calc_due_at(now: datetime, template: dict) -> datetime:
    if "due_hours" in template:
        return now + timedelta(hours=int(template["due_hours"]))
    return now + timedelta(days=int(template.get("due_days", 0)))


async def seed_todos_data():
    print("Beginning Todo Data Seeding...")
    async with SessionLocal() as db:
        admin_res = await db.execute(select(User.id).where(User.username == "admin"))
        admin_id = admin_res.scalar_one_or_none()

        preferred_usernames = ["test_portal_plain", "sarah", "marcus"]
        selected_users = []
        for username in preferred_usernames:
            user_res = await db.execute(
                select(User)
                .where(
                    User.username == username,
                    User.account_type == "PORTAL",
                    User.is_active == True,
                )
            )
            user = user_res.scalars().first()
            if user:
                selected_users.append(user)

        if not selected_users:
            user_res = await db.execute(
                select(User)
                .where(User.account_type == "PORTAL", User.is_active == True)
                .order_by(User.id.asc())
                .limit(3)
            )
            selected_users = user_res.scalars().all()

        if not selected_users:
            print("No active portal users found; skipping todo seed.")
            return

        selected_ids = [int(u.id) for u in selected_users]
        await db.execute(
            delete(Todo).where(
                Todo.assignee_id.in_(selected_ids),
                Todo.description.like(f"{SEED_MARKER}%"),
            )
        )
        await db.commit()

        now = datetime.now(timezone.utc)
        created_count = 0

        for index, user in enumerate(selected_users):
            time_shift = now + timedelta(minutes=index * 15)
            for tpl in TODO_TEMPLATES:
                todo = Todo(
                    title=tpl["title"],
                    description=f"{SEED_MARKER} assignee={user.username}; priority={tpl['priority']}",
                    status=tpl["status"],
                    priority=tpl["priority"],
                    due_at=_calc_due_at(time_shift, tpl),
                    assignee_id=user.id,
                    creator_id=admin_id or user.id,
                    created_at=time_shift,
                    updated_at=time_shift,
                )
                db.add(todo)
                created_count += 1

        await db.commit()
        print(f"Inserted {created_count} todo records for {len(selected_users)} portal users.")

    print("Todo Seeding Complete!")


if __name__ == "__main__":
    asyncio.run(seed_todos_data())
