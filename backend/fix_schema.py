
import asyncio
from sqlalchemy import text
from database import SessionLocal

async def fix_schema():
    print("Starting schema fix...")
    async with SessionLocal() as db:
        async with db.begin():
            # Check and add columns for system_logs
            print("Checking system_logs columns...")
            columns_to_add = [
                ("ip_address", "VARCHAR"),
                ("request_path", "VARCHAR"),
                ("method", "VARCHAR"),
                ("status_code", "INTEGER"),
                ("response_time", "FLOAT"),
                ("request_size", "INTEGER"),
                ("user_agent", "VARCHAR")
            ]
            
            for col_name, col_type in columns_to_add:
                try:
                    await db.execute(text(f"ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                    print(f"Added column {col_name} to system_logs")
                except Exception as e:
                    print(f"Error adding {col_name}: {e}")

    print("Schema fix complete.")

if __name__ == "__main__":
    asyncio.run(fix_schema())
