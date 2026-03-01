import asyncio
from sqlalchemy import text
from database import engine

async def migrate_todos():
    async with engine.begin() as conn:
        print("Migrating todos table...")
        # 1. Rename due_date -> due_at
        await conn.execute(text("ALTER TABLE todos RENAME COLUMN due_date TO due_at;"))
        # 2. Add temporary priority column
        await conn.execute(text("ALTER TABLE todos ADD COLUMN priority_int INTEGER DEFAULT 2;"))
        # 3. Migrate data (map string to int)
        await conn.execute(text("UPDATE todos SET priority_int = 1 WHERE priority = 'high';"))
        await conn.execute(text("UPDATE todos SET priority_int = 2 WHERE priority = 'medium';"))
        await conn.execute(text("UPDATE todos SET priority_int = 3 WHERE priority = 'low';"))
        # 4. Drop old column and rename new one
        await conn.execute(text("ALTER TABLE todos DROP COLUMN priority;"))
        await conn.execute(text("ALTER TABLE todos RENAME COLUMN priority_int TO priority;"))
        print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(migrate_todos())
