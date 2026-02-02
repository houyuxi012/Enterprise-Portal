import asyncio
from database import SessionLocal
from models import User, Role
from sqlalchemy import select
from sqlalchemy.orm import selectinload

async def fix_admin_role():
    async with SessionLocal() as db:
        print("Fixing admin role...")
        # Fetch admin user
        result = await db.execute(select(User).options(selectinload(User.roles)).where(User.username == "admin"))
        user = result.scalars().first()
        
        if not user:
            print("Admin user not found!")
            return

        # Fetch admin role
        result_role = await db.execute(select(Role).where(Role.code == "admin"))
        role = result_role.scalars().first()
        
        if not role:
            print("Admin role not found!")
            return
            
        # Check and Assign
        has_role = any(r.id == role.id for r in user.roles)
        if not has_role:
            print("Assigning admin role to user...")
            user.roles.append(role)
            await db.commit()
            print("✅ Admin role assigned.")
        else:
            print("✅ Admin user already has admin role.")

if __name__ == "__main__":
    asyncio.run(fix_admin_role())
