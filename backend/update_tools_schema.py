from sqlalchemy import create_engine, text
import os

# Get DB URL from environment or default
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/portal_db")

# Adjust for asyncpg if needed, but for migration script we need sync driver usually
# Or just use raw psycopg2 connection.
# But replacing +asyncpg with generic might fail if driver not installed?
# Standard docker image has psycopg2 binary usually?
# Let's try to use standard url.
if "+asyncpg" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")

engine = create_engine(DATABASE_URL)

def run_migration():
    with engine.connect() as conn:
        try:
            # Check if column exists
            # This is postgres specific check
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='tools' AND column_name='sort_order';"))
            if result.fetchone():
                print("Column 'sort_order' already exists.")
            else:
                print("Adding 'sort_order' column to 'tools' table...")
                conn.execute(text("ALTER TABLE tools ADD COLUMN sort_order INTEGER DEFAULT 0;"))
                conn.commit()
                print("Migration successful.")
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    run_migration()
