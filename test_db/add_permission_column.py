import sys
import os
import asyncio
from sqlalchemy import text
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine

# Add project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not set")
    sys.exit(1)

async def add_column():
    print(f"Connecting to database...")
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        try:
            # Check if column exists first? Or just try add
            # Postgres supports IF NOT EXISTS for adding column in newer versions (9.6+)
            print("Executing ALTER TABLE...")
            await conn.execute(text("ALTER TABLE tools ADD COLUMN IF NOT EXISTS visible_to_departments TEXT;"))
            print("Column 'visible_to_departments' added successfully.")
        except Exception as e:
            print(f"Error adding column: {e}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(add_column())
