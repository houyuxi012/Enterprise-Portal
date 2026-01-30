import asyncio
import os
from database import SessionLocal, engine, Base
import models
from utils import get_password_hash
from sqlalchemy import select
from datetime import date

async def init_db():
    print("Creating tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with SessionLocal() as db:
        print("Seeding data...")
        
        # 1. Admin User
        result = await db.execute(select(models.User).filter(models.User.username == "admin"))
        if not result.scalars().first():
            admin = models.User(
                username="admin", 
                email="admin@shiku.com", 
                hashed_password=get_password_hash("admin"), 
                role="admin"
            )
            db.add(admin)
            print("Admin user created.")

        # 2. Employees
        result = await db.execute(select(models.Employee))
        if not result.scalars().first():
            employees = [
                models.Employee(id=1, account="zhangsan", job_number="1001", name="张三", gender="男", role="高级工程师", department="技术部", email="zhangsan@shiku.com", phone="13800138000", location="北京总部-3F", avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=zhangsan", status="在线"),
                models.Employee(id=2, account="lisi", job_number="1002", name="李四", gender="女", role="产品经理", department="产品部", email="lisi@shiku.com", phone="13900139000", location="上海分公司-12F", avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=lisi", status="会议中"),
                models.Employee(id=3, account="wangwu", job_number="1003", name="王五", gender="男", role="设计师", department="设计部", email="wangwu@shiku.com", phone="13700137000", location="深圳研发中心-5F", avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=wangwu", status="离线"),
            ]
            db.add_all(employees)
            print("Employees seeded.")

        # 3. News
        result = await db.execute(select(models.NewsItem))
        if not result.scalars().first():
            news_items = [
                models.NewsItem(
                    title="2024 年度战略发布会圆满落幕",
                    summary="公司确立了未来三年的核心增长引擎，强调以AI技术赋能业务全流程。",
                    category="公告",
                    date=date(2024, 1, 15),
                    author="总经办",
                    image="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200"
                ),
                models.NewsItem(
                    title="ShiKu 义工日：我们在行动",
                    summary="超过100名员工参与了本次社区环保活动，展现了企业的社会责任感。",
                    category="活动",
                    date=date(2024, 2, 20),
                    author="行政部",
                    image="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200"
                )
            ]
            db.add_all(news_items)
            print("News seeded.")

        # 4. Tools
        result = await db.execute(select(models.QuickTool))
        if not result.scalars().first():
            tools = [
                models.QuickTool(name="人事门户", icon_name="Users", url="#", color="bg-blue-100 text-blue-600", category="行政管理", description="请假、入职及个人档案管理"),
                models.QuickTool(name="财务系统", icon_name="CreditCard", url="#", color="bg-green-100 text-green-600", category="行政管理", description="报销、薪资及预算申请"),
                models.QuickTool(name="IT工单", icon_name="LifeBuoy", url="#", color="bg-purple-100 text-purple-600", category="行政管理", description="设备故障、软件安装及权限申请"),
                models.QuickTool(name="知识库", icon_name="FileText", url="#", color="bg-orange-100 text-orange-600", category="常用工具", description="公司文档、政策及培训资料"),
            ]
            db.add_all(tools)
            print("Tools seeded.")

        # 5. Carousel
        result = await db.execute(select(models.CarouselItem))
        if not result.scalars().first():
            carousel_items = [
                models.CarouselItem(
                    title="2024 年度战略发布会圆满落幕",
                    image="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200",
                    url="#",
                    badge="焦点新闻",
                    sort_order=1
                ),
                models.CarouselItem(
                    title="ShiKu 义工日：我们在行动",
                    image="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200",
                    url="#",
                    badge="企业责任",
                    sort_order=2
                ),
                models.CarouselItem(
                    title="新一代协作平台即将灰度测试",
                    image="https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=1200",
                    url="#",
                    badge="产品动态",
                    sort_order=3
                )
            ]
            db.add_all(carousel_items)
            print("Carousel items seeded.")
            
        await db.commit()
        print("Data seeding completed!")

if __name__ == "__main__":
    asyncio.run(init_db())
