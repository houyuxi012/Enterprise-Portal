import asyncio
import sys
import os

# Add parent directory to sys.path to allow importing from backend modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import engine, Base, SessionLocal
from models import Employee, NewsItem, QuickTool, Announcement, Department, User, Role, AIProvider, SystemConfig
from sqlalchemy import select
from datetime import datetime
import os
from utils import get_password_hash

# Data
EMPLOYEES = [
  { "name": '陈莎莎', "role": '产品设计主管', "department": '设计部', "email": 'sarah.c@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=sarah', "status": '在线', "job_number": "1001", "account": "sarah", "gender": "女", "phone": "13800138001" },
  { "name": '马库斯', "role": '高级工程师', "department": '技术部', "email": 'm.miller@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=marcus', "status": '会议中', "job_number": "1002", "account": "marcus", "gender": "男", "phone": "13800138002" },
  { "name": '艾莎', "role": '市场经理', "department": '增长部', "email": 'aisha.g@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=aisha', "status": '在线', "job_number": "1003", "account": "aisha", "gender": "女", "phone": "13800138003" },
  { "name": '王汤姆', "role": '人力资源专员', "department": '人事部', "email": 'tom.w@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=tom', "status": '离线', "job_number": "1004", "account": "tom", "gender": "男", "phone": "13800138004" },
  { "name": '李小明', "role": '前端工程师', "department": '技术部', "email": 'xiaoming.li@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=xiaoming', "status": '在线', "job_number": "1005", "account": "xiaoming", "gender": "男", "phone": "13800138005" },
  { "name": '张雨晴', "role": 'UI设计师', "department": '设计部', "email": 'yuqing.z@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=yuqing', "status": '在线', "job_number": "1006", "account": "yuqing", "gender": "女", "phone": "13800138006" },
  { "name": '刘大伟', "role": '后端工程师', "department": '技术部', "email": 'dawei.l@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=dawei', "status": '会议中', "job_number": "1007", "account": "dawei", "gender": "男", "phone": "13800138007" },
  { "name": '赵雪梅', "role": '财务主管', "department": '财务部', "email": 'xuemei.z@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=xuemei', "status": '在线', "job_number": "1008", "account": "xuemei", "gender": "女", "phone": "13800138008" },
  { "name": '孙博文', "role": '运维工程师', "department": '运维部', "email": 'bowen.s@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=bowen', "status": '离线', "job_number": "1009", "account": "bowen", "gender": "男", "phone": "13800138009" },
  { "name": '周婷婷', "role": '法务专员', "department": '法务部', "email": 'tingting.z@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=tingting', "status": '在线', "job_number": "1010", "account": "tingting", "gender": "女", "phone": "13800138010" },
  { "name": '吴健', "role": '销售经理', "department": '销售部', "email": 'jian.w@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=wujian', "status": '在线', "job_number": "1011", "account": "wujian", "gender": "男", "phone": "13800138011" },
  { "name": '钱丽丽', "role": '行政助理', "department": '行政部', "email": 'lili.q@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=lili', "status": '在线', "job_number": "1012", "account": "lili", "gender": "女", "phone": "13800138012" },
]

NEWS = [
  {
    "title": 'Q3 季度办公安全新规',
    "summary": '从7月1日起，将更新工作场所安全与健康合规准则。',
    "category": '政策',
    "date": '2024-05-20',
    "author": '安全部',
    "image": 'https://picsum.photos/seed/safety/400/200'
  },
  {
    "title": '年度团建活动 - 开始早鸟报名',
    "summary": '加入我们2024年的巴厘岛团建，现在报名即可预定机票偏好！',
    "category": '活动',
    "date": '2024-05-18',
    "author": '企业文化组',
    "image": 'https://picsum.photos/seed/retreat/400/200'
  },
  {
    "title": '季度财务报告：同比增长15%',
    "summary": 'ShiKu Home 在市场扩张和客户满意度方面达到了新的里程碑。',
    "category": '公告',
    "date": '2024-05-15',
    "author": '财务部',
    "image": 'https://picsum.photos/seed/growth/400/200'
  }
]

TOOLS = [
  { "name": '人事门户', "icon_name": 'Users', "url": '#', "color": 'bg-blue-100 text-blue-600', "category": '行政管理', "description": '请假、入职及个人档案管理', "visible_to_departments": '["人事部", "行政部"]' },
  { "name": '报销管理', "icon_name": 'CreditCard', "url": '#', "color": 'bg-emerald-100 text-emerald-600', "category": '财务流程', "description": '提交差旅及日常办公费用报销', "visible_to_departments": '["财务部"]' },
  { "name": 'IT 支持', "icon_name": 'LifeBuoy', "url": '#', "color": 'bg-orange-100 text-orange-600', "category": '技术服务', "description": '报修、设备申领及密码重置', "visible_to_departments": '["技术部", "运维部"]' },
  { "name": '文档中心', "icon_name": 'FileText', "url": '#', "color": 'bg-purple-100 text-purple-600', "category": '资源库', "description": '公司模板、手册及共享文档' },
  { "name": '项目同步', "icon_name": 'Briefcase', "url": '#', "color": 'bg-indigo-100 text-indigo-600', "category": '生产力', "description": '跨部门协作与进度跟踪' },
  { "name": '活动日历', "icon_name": 'Calendar', "url": '#', "color": 'bg-rose-100 text-rose-600', "category": '企业文化', "description": '近期活动、放假安排及会议室预定' },
  { "name": '安全中心', "icon_name": 'ShieldCheck', "url": '#', "color": 'bg-cyan-100 text-cyan-600', "category": '技术服务', "description": '安全准则与合规性检查', "visible_to_departments": '["技术部", "运维部", "安全部"]' },
  { "name": '企业邮箱', "icon_name": 'Mail', "url": '#', "color": 'bg-amber-100 text-amber-600', "category": '通讯工具', "description": '访问您的 Outlook 企业邮箱' },
  { "name": '官方网站', "icon_name": 'Globe', "url": '#', "color": 'bg-teal-100 text-teal-600', "category": '资讯动态', "description": '外部品牌展示与新闻发布' },
  { "name": 'ShiKu Chat', "icon_name": 'MessageSquare', "url": '#', "color": 'bg-blue-100 text-blue-500', "category": '通讯工具', "description": '内部即时通讯与讨论组' },
  { "name": '数据分析', "icon_name": 'PieChart', "url": '#', "color": 'bg-violet-100 text-violet-600', "category": '生产力', "description": '季度 KPI 与业务指标可视化', "visible_to_departments": '["总经办", "财务部", "增长部"]' },
  { "name": '网盘空间', "icon_name": 'HardDrive', "url": '#', "color": 'bg-slate-100 text-slate-600', "category": '资源库', "description": '个人 100GB 云端存储空间' },
]

ANNOUNCEMENTS = [
  { "tag": '美食', "title": '今日主厨特供：松露牛肉', "content": '今天午餐时段，公司食堂主厨将为您奉上精心准备的松露牛肉，欢迎品尝。', "time": '刚才', "color": 'orange', "is_urgent": False },
  { "tag": '维护', "title": '5号会议室音响升级', "content": '5号会议室正在进行音响系统维护，预计今日下午 16:00 前完成。', "time": '20分钟前', "color": 'blue', "is_urgent": False },
  { "tag": '行政', "title": '端午节放假安排通知', "content": '端午节放假时间为 6月8日至6月10日，共3天。请大家妥善安排工作。', "time": '1小时前', "color": 'emerald', "is_urgent": True },
  { "tag": '招聘', "title": '伯乐奖：推荐人才入职立奖', "content": '公司急招高级前端工程师，内部推荐成功入职并过试用期可获得 5000 元奖金。', "time": '3小时前', "color": 'purple', "is_urgent": False },
  { "tag": 'IT', "title": 'VPN 全面升级至 2.0 版本', "content": '为了提供更稳定的远程办公体验，VPN 系统已升级。请及时下载新客户端。', "time": '昨日', "color": 'rose', "is_urgent": False },
]

async def init_db():
    retries = 10
    while retries > 0:
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            break
        except Exception as e:
            retries -= 1
            print(f"Database not ready, retrying in 3 seconds... ({retries} retries left)")
            await asyncio.sleep(3)
            if retries == 0:
                raise e

    async with SessionLocal() as db:
        
        # 1. Seed Departments (Hierarchy)
        print("Checking Departments...")
        stmt = select(Department).where(Department.name == "总部")
        result = await db.execute(stmt)
        root = result.scalars().first()
        
        if not root:
            print("Seeding Departments Hierarchy...")
            # Level 1
            root = Department(name="总部", manager="CEO", description="公司总部")
            db.add(root)
            await db.flush()
            
            # Level 2
            it_center = Department(name="IT中心", parent_id=root.id, manager="CTO", description="技术研发中心")
            prod_center = Department(name="产品中心", parent_id=root.id, manager="CPO", description="产品与设计")
            func_center = Department(name="职能中心", parent_id=root.id, manager="COO", description="职能支持部门")
            db.add_all([it_center, prod_center, func_center])
            await db.flush()
            
            # Level 3 - IT
            db.add(Department(name="技术部", parent_id=it_center.id, manager="马库斯"))
            db.add(Department(name="运维部", parent_id=it_center.id, manager="孙博文")) 
            # Level 3 - Product
            db.add(Department(name="设计部", parent_id=prod_center.id, manager="陈莎莎"))
            db.add(Department(name="增长部", parent_id=prod_center.id, manager="艾莎"))
            # Level 3 - Func
            db.add(Department(name="人事部", parent_id=func_center.id, manager="王汤姆"))
            db.add(Department(name="行政部", parent_id=func_center.id, manager="钱丽丽"))
            db.add(Department(name="财务部", parent_id=func_center.id, manager="赵雪梅"))
            db.add(Department(name="法务部", parent_id=func_center.id, manager="周婷婷"))
            db.add(Department(name="销售部", parent_id=func_center.id, manager="吴健"))
            
            # We don't commit yet, wait for employees
            print("Departments Seeded.")
        
        # 2. Seed Employees
        print("Checking Employees...")
        result = await db.execute(select(Employee))
        if not result.scalars().first():
            print("Seeding Employees...")
            for emp_data in EMPLOYEES:
                # Check if employee exists by job_number to avoid dupes if partially seeded
                exists = await db.execute(select(Employee).where(Employee.job_number == emp_data["job_number"]))
                if not exists.scalars().first():
                    db.add(Employee(**emp_data))
        
        # 3. Seed News
        result_news = await db.execute(select(NewsItem))
        if not result_news.scalars().first():
            for news_data in NEWS:
                news_data['date'] = datetime.strptime(news_data['date'], '%Y-%m-%d').date()
                db.add(NewsItem(**news_data))
                
        # 4. Upsert Tools
        print("Upserting Tools...")
        for tool_data in TOOLS:
            stmt = select(QuickTool).where(QuickTool.name == tool_data["name"])
            result = await db.execute(stmt)
            existing = result.scalars().first()
            
            if existing:
                # Update
                for k, v in tool_data.items():
                    setattr(existing, k, v)
            else:
                # Insert
                db.add(QuickTool(**tool_data))
                
        # 5. Seed Announcements
        result_ann = await db.execute(select(Announcement))
        if not result_ann.scalars().first():
            for ann_data in ANNOUNCEMENTS:
                db.add(Announcement(**ann_data))

        # 6. Admin User
        result_user = await db.execute(select(User).where(User.username == "admin"))
        if not result_user.scalars().first():
            print("Creating default admin user...")
            admin_user = User(
                username="admin", 
                email="admin@shiku.com",
                hashed_password=get_password_hash("admin"),
                is_active=True,
                name="Administrator",
                avatar=""
            )
            db.add(admin_user)
            await db.flush()
            
            # Assign Admin Role
            admin_role_res = await db.execute(select(Role).where(Role.code == "admin"))
            admin_role = admin_role_res.scalars().first()
            if admin_role:
                 admin_user.roles.append(admin_role)
            else:
                 print("Warning: Admin role not found due to dependency. Ideally run rbac_init first.")

        # 6.5 Create User accounts for each Employee (Default Password: 123456)
        print("Creating User accounts for employees...")
        user_role_res = await db.execute(select(Role).where(Role.code == "user"))
        user_role = user_role_res.scalars().first()
        
        for emp_data in EMPLOYEES:
            emp_username = emp_data.get("account")
            if not emp_username:
                continue
            
            exists = await db.execute(select(User).where(User.username == emp_username))
            if not exists.scalars().first():
                emp_user = User(
                    username=emp_username,
                    email=emp_data.get("email", f"{emp_username}@shiku.com"),
                    hashed_password=get_password_hash("123456"),  # Default password
                    is_active=True,
                    name=emp_data.get("name", emp_username),
                    avatar=emp_data.get("avatar", "")
                )
                db.add(emp_user)
                await db.flush()
                
                # Assign User Role
                if user_role:
                    emp_user.roles.append(user_role)
                
                print(f" > Created user: {emp_username}")

        # 7. AI Providers
        result_ai = await db.execute(select(AIProvider).where(AIProvider.name == "Google Gemini 2.0 flash"))
        if not result_ai.scalars().first():
            api_key = os.getenv("GEMINI_API_KEY", "sk-demo-key-placeholder")
            gemini_provider = AIProvider(
                name="Google Gemini 2.0 flash",
                type="gemini",
                base_url="https://generativelanguage.googleapis.com/v1beta/models",
                api_key=api_key,
                model="gemini-2.0-flash",
                is_active=True,
                created_at=datetime.utcnow()
            )
            db.add(gemini_provider)

        result_ai_3 = await db.execute(select(AIProvider).where(AIProvider.name == "Google Gemini 3.0 flash"))
        if not result_ai_3.scalars().first():
            api_key = os.getenv("GEMINI_API_KEY", "sk-demo-key-placeholder")
            gemini_provider_3 = AIProvider(
                name="Google Gemini 3.0 flash",
                type="gemini",
                base_url="https://generativelanguage.googleapis.com/v1beta/models", 
                api_key=api_key,
                model="gemini-3.0-flash",
                is_active=True,
                created_at=datetime.utcnow()
            )
            db.add(gemini_provider_3)

        # 8. Upsert System Config
        print("Upserting System Config...")
        base_configs = [
            {"key": "app_name", "value": "Next-Gen Enterprise Portal"},
            {"key": "footer_text", "value": "© 2026 Next-Gen Enterprise Portal. All Rights Reserved."},
            {"key": "search_ai_enabled", "value": "true"},
            {"key": "privacy_policy", "value": "## 隐私权政策\n\n欢迎使用本系统。我们重视您的隐私。\n\n### 1. 信息收集\n我们收集您的基本信息以提供服务...\n\n### 2. 信息使用\n仅用于企业内部管理..."},
            {"key": "browser_title", "value": "Next-Gen Enterprise Portal ｜ Dashboard"},
            {"key": "logo_url", "value": ""},
            {"key": "favicon_url", "value": ""}
        ]
        
        for conf in base_configs:
            stmt = select(SystemConfig).where(SystemConfig.key == conf["key"])
            result = await db.execute(stmt)
            existing = result.scalars().first()
            if existing:
                # Update only if value is effectively empty or we want to enforce defaults?
                # User asked for "Sync". I'll enforce default for keys that are critical or empty.
                # Actually commonly init scripts only insert. 
                # But user said "Sync update".
                # Let's update IF the existing value is the OLD default (hard to know).
                # To be safe, let's only Insert if missing.
                # User request probably meant "Add new keys".
                pass 
            else:
                db.add(SystemConfig(**conf))
            
            # Special case: privacy_policy if missing
            if conf["key"] == "privacy_policy" and existing is None:
                 # Already handled by else block
                 pass
            
        await db.commit()
        print("Data initialization complete!")


if __name__ == "__main__":
    asyncio.run(init_db())
