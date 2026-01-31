
import asyncio
from sqlalchemy import text
from database import SessionLocal

async def add_trace_id():
    print("Starting schema migration: Add trace_id to business_logs...")
    async with SessionLocal() as db:
        async with db.begin():
            try:
                # Add trace_id column
                await db.execute(text("ALTER TABLE business_logs ADD COLUMN IF NOT EXISTS trace_id VARCHAR"))
                print("Added column trace_id to business_logs")
                
                # Add index
                await db.execute(text("CREATE INDEX IF NOT EXISTS ix_business_logs_trace_id ON business_logs (trace_id)"))
                print("Added index for trace_id")
                
            except Exception as e:
                print(f"Error during migration: {e}")

    print("Migration complete.")

if __name__ == "__main__":
    asyncio.run(add_trace_id())
