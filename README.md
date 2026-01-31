# ShiKu Home - Next-Gen Enterprise Portal

> 新一代企业级内网门户系统，采用 React 18 + FastAPI + PostgreSQL + MinIO 构建，提供现代化、高性能、美观的数字化办公体验。

ShiKu Home 不仅仅是一个导航页，它是一个集成了应用管理、组织架构、日志审计、即时资讯和 AI 助手的完整企业工作台。

## ✨ 核心功能 (Core Features)

### 🖥️ 用户门户 (User Portal)
- **现代化仪表盘**: 极简设计，提供公告轮播、快捷应用网格、最新动态聚合。
- **应用中心 (App Center)**: 统一管理企业内部工具，支持分类、搜索与一键直达。
- **团队通讯录**: 可视化组织架构树，快速查找同事联系方式。
- **AI 智能助手**: 集成 Google Gemini 模型，支持**多模态图片上传分析**与智能问答支持。

### 🛡️ 管理后台 (Admin Portal)
- **Premium Dashboard**: 全新设计的玻璃拟态仪表盘，实时监控 CPU/内存/网络资源与业务数据趋势。
- **组织架构管理**: 可视化部门树管理，支持无限级部门嵌套与员工调岗。
- **全链路日志审计**:
    - **系统日志**: 监控系统运行状态与异常堆栈。
    - **登录审计**: 记录所有登录尝试 (User, IP, Device, Status)，支持防爆破检测。
    - **日志外发**: 支持 Syslog/Webhook 实时转发至第三方 SIEM 平台。
- **存储服务**:
    - **MinIO 集成**: 支持对象存储 (S3 兼容)，用于头像、文件、图片的高可用存储。
    - **生产级安全**: 文件类型魔数校验、5MB 大小限制、病毒扫描预留。
- **资讯内容管理**: Premium 风格的新闻、公告、轮播图管理界面。
- **企业个性化 (Branding)**: 支持自定义 Logo、系统名称、版权信息与浏览器标题设置。
- **AI 管理**: 支持多 AI 服务商配置、API Key 加密存储、安全策略管理、**搜索栏 AI 开关与默认模型配置**。

## 🛠️ 技术栈 (Tech Stack)

### Frontend (前台)
- **框架**: [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- **UI 组件**: [Ant Design 5](https://ant.design/) (主要组件) + [TailwindCSS](https://tailwindcss.com/) (样式引擎)
- **图标库**: [Lucide React](https://lucide.dev/)
- **数据流**: Axios (withCredentials for HttpOnly Cookie Auth)
- **设计风格**: Glassmorphism (玻璃拟态), Modern Clean UI

### Backend (后台)
- **框架**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **数据库**: [PostgreSQL 17](https://www.postgresql.org/)
- **缓存**: [Redis](https://redis.io/)
- **ORM**: [SQLAlchemy](https://www.sqlalchemy.org/) (AsyncIO) + [Pydantic](https://docs.pydantic.dev/)
- **认证**: HttpOnly Cookie + JWT (Secure, SameSite=Lax)
- **加密**: Fernet 对称加密 (用于 API Key 存储)

### Infrastructure (基础设施)
- **容器化**: Docker Compose
- **反向代理**: Nginx (HTTPS, HSTS, Security Headers)
- **对象存储**: MinIO (S3 兼容)
- **SSL**: 自签名证书 (开发) / Let's Encrypt (生产)

## 🚀 快速开始 (Quick Start)

### 方式一：Docker Compose 全栈部署 (推荐)

最快速的启动方式，包含前端、后端、数据库、Redis、MinIO：

```bash
# 1. 克隆项目
git clone <repository-url>
cd Enterprise\ Portal

# 2. 启动所有服务
docker-compose up -d --build

# 3. 访问系统
# 前端: https://localhost (需接受自签名证书警告)
# 后端 API 文档: https://localhost/api/docs
# MinIO Console: http://localhost:9001 (minioadmin/minioadmin@houyuxi)

# 默认管理员: admin / 123456
```

> ⚠️ **注意**: 首次访问 `https://localhost` 时，浏览器会提示证书不受信任。这是预期行为，请点击"高级" → "继续访问"。

### 方式二：本地开发部署 (Local Development)

适用于开发者进行功能迭代。

**前提条件**:
- Python 3.10+
- Node.js 18+
- PostgreSQL (本地安装或 Docker 启动)
- Redis

**1. 启动数据库和依赖服务**
```bash
docker-compose up -d db redis minio createbuckets
```

**2. 启动后端**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**3. 启动前端 (开发模式)**
```bash
cd frontend
npm install
npm run dev
```
前端开发服务器运行在 `http://localhost:3000`，自动代理 `/api` 请求到后端。

## ⚙️ 环境变量配置 (Configuration)

### 本地开发环境

在 `backend` 目录下创建 `.env` 文件：

```env
# 基础配置
GEMINI_API_KEY=your_gemini_api_key
SECRET_KEY=your_jwt_secret_key

# 数据库配置
DATABASE_URL=postgresql+asyncpg://user:password@localhost/portal_db
REDIS_URL=redis://localhost:6379

# Cookie 配置 (开发环境)
COOKIE_SECURE=False
COOKIE_DOMAIN=
```

## 🔒 安全特性 (Security Features)

- **HTTPS 强制**: Nginx 自动将 HTTP 重定向到 HTTPS
- **安全响应头**: HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- **HttpOnly Cookie**: JWT Token 存储在 HttpOnly Cookie 中，防止 XSS
- **CORS 白名单**: 严格限制允许的源
- **API Key 加密**: 使用 Fernet 对称加密存储敏感密钥
- **限流保护**: Nginx 层 API 限流 (10r/s, burst 20)
- **文件上传安全**: 魔数校验、大小限制、类型白名单

## 📁 项目结构 (Project Structure)

```
Enterprise Portal/
├── backend/                 # FastAPI 后端
│   ├── routers/            # API 路由
│   ├── models.py           # SQLAlchemy 模型
│   ├── utils.py            # 工具函数 (加密、认证)
│   └── main.py             # 应用入口
├── frontend/               # React 前端
│   ├── pages/              # 页面组件
│   ├── components/         # 通用组件
│   ├── services/           # API 客户端
│   └── index.html          # HTML 入口
├── nginx/                  # Nginx 配置
│   ├── nginx.conf          # 主配置文件
│   └── certs/              # SSL 证书
├── docker-compose.yml      # Docker 编排
└── README.md
```

## 📝 License
MIT License © 2025 侯钰熙 
https://www.houyuxi.com
