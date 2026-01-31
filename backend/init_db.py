import asyncio
from database import engine, Base, SessionLocal
from models import Employee, NewsItem, QuickTool, Announcement
from sqlalchemy import select

# Data from constants.tsx
EMPLOYEES = [
  { "name": '陈莎莎', "role": '产品设计主管', "department": '设计部', "email": 'sarah.c@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=sarah', "status": '在线', "job_number": "1001", "account": "sarah", "gender": "女", "phone": "13800138001" },
  { "name": '马库斯', "role": '高级工程师', "department": '技术部', "email": 'm.miller@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=marcus', "status": '会议中', "job_number": "1002", "account": "marcus", "gender": "男", "phone": "13800138002" },
  { "name": '艾莎', "role": '市场经理', "department": '增长部', "email": 'aisha.g@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=aisha', "status": '在线', "job_number": "1003", "account": "aisha", "gender": "女", "phone": "13800138003" },
  { "name": '王汤姆', "role": '人力资源专员', "department": '人事部', "email": 'tom.w@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=tom', "status": '离线', "job_number": "1004", "account": "tom", "gender": "男", "phone": "13800138004" },
  { "name": '李小明', "role": '前端工程师', "department": '技术部', "email": 'xiaoming.li@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=xiaoming', "status": '在线', "job_number": "1005", "account": "xiaoming", "gender": "男", "phone": "13800138005" },
  { "name": '张雨晴', "role": 'UI设计师', "department": '设计部', "email": 'yuqing.z@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=yuqing', "status": '在线', "job_number": "1006", "account": "yuqing", "gender": "女", "phone": "13800138006" },
  { "name": '刘大伟', "role": '后端工程师', "department": '技术部', "email": 'dawei.l@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=dawei', "status": '会议中', "job_number": "1007", "account": "dawei", "gender": "男", "phone": "13800138007" },
  { "name": '赵雪梅', "role": '财务主管', "department": '财务部', "email": 'xuemei.z@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=xuemei', "status": '在线', "job_number": "1008", "account": "xuemei", "gender": "女", "phone": "13800138008" },
  { "name": '孙博文', "role": '运维工程师', "department": '技术部', "email": 'bowen.s@shiku.com', "avatar": 'https://i.pravatar.cc/150?u=bowen', "status": '离线', "job_number": "1009", "account": "bowen", "gender": "男", "phone": "13800138009" },
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
  { "name": '人事门户', "icon_name": 'Users', "url": '#', "color": 'bg-blue-100 text-blue-600', "category": '行政管理', "description": '请假、入职及个人档案管理' },
  { "name": '报销管理', "icon_name": 'CreditCard', "url": '#', "color": 'bg-emerald-100 text-emerald-600', "category": '财务流程', "description": '提交差旅及日常办公费用报销' },
  { "name": 'IT 支持', "icon_name": 'LifeBuoy', "url": '#', "color": 'bg-orange-100 text-orange-600', "category": '技术服务', "description": '报修、设备申领及密码重置' },
  { "name": '文档中心', "icon_name": 'FileText', "url": '#', "color": 'bg-purple-100 text-purple-600', "category": '资源库', "description": '公司模板、手册及共享文档' },
  { "name": '项目同步', "icon_name": 'Briefcase', "url": '#', "color": 'bg-indigo-100 text-indigo-600', "category": '生产力', "description": '跨部门协作与进度跟踪' },
  { "name": '活动日历', "icon_name": 'Calendar', "url": '#', "color": 'bg-rose-100 text-rose-600', "category": '企业文化', "description": '近期活动、放假安排及会议室预定' },
  { "name": '安全中心', "icon_name": 'ShieldCheck', "url": '#', "color": 'bg-cyan-100 text-cyan-600', "category": '技术服务', "description": '安全准则与合规性检查' },
  { "name": '企业邮箱', "icon_name": 'Mail', "url": '#', "color": 'bg-amber-100 text-amber-600', "category": '通讯工具', "description": '访问您的 Outlook 企业邮箱' },
  { "name": '官方网站', "icon_name": 'Globe', "url": '#', "color": 'bg-teal-100 text-teal-600', "category": '资讯动态', "description": '外部品牌展示与新闻发布' },
  { "name": 'ShiKu Chat', "icon_name": 'MessageSquare', "url": '#', "color": 'bg-blue-100 text-blue-500', "category": '通讯工具', "description": '内部即时通讯与讨论组' },
  { "name": '数据分析', "icon_name": 'PieChart', "url": '#', "color": 'bg-violet-100 text-violet-600', "category": '生产力', "description": '季度 KPI 与业务指标可视化' },
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

        # Check if initialized
        result = await db.execute(select(Employee))
        if not result.scalars().first():
            print("Seeding data...")
            
            # Add Employees
            for emp_data in EMPLOYEES:
                db.add(Employee(**emp_data))
                
            # Add News
            from datetime import datetime
            for news_data in NEWS:
                # simple date parsing
                news_data['date'] = datetime.strptime(news_data['date'], '%Y-%m-%d').date()
                db.add(NewsItem(**news_data))
                
            # Add Tools
            for tool_data in TOOLS:
                db.add(QuickTool(**tool_data))
                
            # Add Announcements
            for ann_data in ANNOUNCEMENTS:
                db.add(Announcement(**ann_data))
        else:
            print("Data already seeded.")

        # Always check and add Admin User
        from models import User
        from utils import get_password_hash
        
        result_user = await db.execute(select(User).where(User.username == "admin"))
        if not result_user.scalars().first():
            print("Creating default admin user...")
            admin_user = User(
                username="admin", 
                email="admin@shiku.com",
                hashed_password=get_password_hash("admin"), # Default password
                role="admin",
                name="Administrator",
                avatar=""
            )
            db.add(admin_user)
            
        await db.commit()
        print("Done!")
        print("Done!")

if __name__ == "__main__":
    asyncio.run(init_db())
