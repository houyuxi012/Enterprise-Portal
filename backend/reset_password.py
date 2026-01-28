
import asyncio
from database import SessionLocal
from models import User
from utils import get_password_hash
from sqlalchemy import select

async def reset_admin():
    async with SessionLocal() as db:
        result = await db.execute(select(User).filter(User.username == "admin"))
        user = result.scalars().first()
        if user:
            print(f"Updating password for {user.username}...")
            user.hashed_password = get_password_hash("admin")
            await db.commit()
            print("Password updated to 'admin'")
        else:
            print("Admin user not found")

if __name__ == "__main__":
    asyncio.run(reset_admin())
