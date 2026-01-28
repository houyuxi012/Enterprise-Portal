import asyncio
from database import SessionLocal
import models
from sqlalchemy import select

async def test_delete():
    async with SessionLocal() as db:
        # Create dummy dept
        print("Creating dummy department 'TemporaryDeleteTest'...")
        dept = models.Department(name="TemporaryDeleteTest")
        db.add(dept)
        await db.commit()
        await db.refresh(dept)
        print(f"Created dept ID: {dept.id}")
        
        # Try delete logic manually
        try:
            print("Checking for children...")
            child_check = await db.execute(select(models.Department).filter(models.Department.parent_id == dept.id))
            if child_check.scalars().first():
                print("Fail: Children found")
                return

            print("Checking for employees...")
            emp_check = await db.execute(select(models.Employee).filter(models.Employee.department == dept.name))
            if emp_check.scalars().first():
                print("Fail: Employee found")
                return

            print("Proceeding to delete...")
            await db.delete(dept)
            await db.commit()
            print("Delete success")
        except Exception as e:
            print(f"Delete failed with exception: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_delete())
