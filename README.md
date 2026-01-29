# ShiKu Home - Next-Gen Enterprise Portal

> 新一代企业级内网门户系统，采用 React 18 + FastAPI + PostgreSQL 构建，提供现代化、高性能、美观的数字化办公体验。

ShiKu Home 不仅仅是一个导航页，它是一个集成了应用管理、组织架构、日志审计、即时资讯和 AI 助手的完整企业工作台。

## ✨ 核心功能 (Core Features)

### 🖥️ 用户门户 (User Portal)
- **现代化仪表盘**: 极简设计，提供公告轮播、快捷应用网格、最新动态聚合。
- **应用中心 (App Center)**: 统一管理企业内部工具，支持分类、搜索与一键直达。
- **团队通讯录**: 可视化组织架构树，快速查找同事联系方式。
- **AI 智能助手**: 集成 Google Gemini 模型，提供企业级智能问答支持。

### 🛡️ 管理后台 (Admin Portal) [NEW]
- **Premium Dashboard**: 全新设计的玻璃拟态仪表盘，实时监控 CPU/内存/网络资源与业务数据趋势。
- **组织架构管理**: 可视化部门树管理，支持无限级部门嵌套与员工调岗。
- **全链路日志审计**:
    - **系统日志**: 监控系统运行状态与异常堆栈。
    - **业务日志**: 审计关键操作（如登录、搜索、配置修改）。
    - **日志外发**: 支持 Syslog/Webhook 实时转发至第三方 SIEM 平台。
- **资讯内容管理**: Premium 风格的新闻、公告、轮播图管理界面。
- **企业个性化 (Branding)**: 支持自定义 Logo、系统名称、版权信息与浏览器标题设置。

## 🛠️ 技术栈 (Tech Stack)

### Frontend (前台)
- **框架**: [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- **UI 组件**: [Ant Design 5](https://ant.design/) (主要组件) + [TailwindCSS](https://tailwindcss.com/) (样式引擎)
- **图标库**: [Lucide React](https://lucide.dev/)
- **数据流**: SWR / Axios
- **设计风格**: Glassmorphism (玻璃拟态), Modern Clean UI

### Backend (后台)
- **框架**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **数据库**: [PostgreSQL](https://www.postgresql.org/)
- **ORM**: [SQLAlchemy](https://www.sqlalchemy.org/) (AsyncIO) + [Pydantic](https://docs.pydantic.dev/)
- **部署**: Docker Compose, Nginx

## 🚀 快速开始 (Quick Start)

### 方式一：Docker Compose 全栈部署 (推荐)

最快速的启动方式，包含前端、后端与数据库：

```bash
# 1. 启动服务
docker-compose up -d --build

# 2. 访问系统
# 前端: http://localhost
# 后端 API 文档: http://localhost:8000/docs
# 默认管理员: admin / admin123
```

### 方式二：本地开发部署 (Local Development)

适用于开发者进行功能迭代。

**前提条件**:
- Python 3.11+
- Node.js 18+
- PostgreSQL (本地安装或 Docker 启动)

**1. 启动数据库**
推荐使用 Docker 启动 PostgreSQL：
```bash
docker-compose up -d db
```

**2. 启动后端**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**3. 启动前端**
```bash
cd frontend
npm install
npm run dev
```

## ⚙️ 环境变量配置 (Configuration)

在 `backend` 目录下创建 `.env` 文件（可选，默认有缺省值）：

```env
# 基础配置
API_KEY=your_gemini_api_key
SECRET_KEY=your_jwt_secret_key

# 数据库配置
DATABASE_URL=postgresql+asyncpg://user:password@localhost/portal_db

# 初始化管理员
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
```

## 📝 License
MIT License © 2025 侯钰熙
