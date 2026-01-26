# ShiKu Enterprise Portal

ShiKu Home 企业内网门户系统，基于 React + FastAPI + PostgreSQL 构建。

## 功能特性

- **仪表盘**: 实时公告、快捷应用、新闻动态。
- **应用中心**: 集成常用企业工具入口。
- **通讯录**: 员工通讯录与部门筛选。
- **AI 助手**: 集成 Google Gemini 的智能问答助手。

## 快速开始

### 方式一：本地开发 (推荐)

前提条件：
- Python 3.11+
- Node.js 18+
- PostgreSQL (可选，默认配置需修改或使用 Docker)

如果你没有安装 PostgreSQL，可以使用 Docker 启动 DB，然后本地运行服务：

1. 运行启动脚本（Mac/Linux）:
   ```bash
   chmod +x start_dev.sh
   ./start_dev.sh
   ```
   此脚本会自动创建 Python 虚拟环境、安装依赖、初始化数据库（SQLite 或配置好的 Postgres）、启动后端和前端。

   > 注意: 默认配置连接 URL 可能需要调整。本项目 `backend/.env` 默认未创建，请参考 `backend/database.py`。
   > 本MVP为了简化，建议后端 `database.py` 中如果连接失败回退到 SQLite，但目前代码是用 `Asyncpg`，必须要有 Postgres。
   
   **推荐使用 Docker Compose 启动数据库**:
   ```bash
   docker-compose up -d db
   ```

### 方式二：Docker 全栈部署

```bash
docker-compose up --build
```

访问地址：
- 前端: http://localhost:80 (Docker) 或 http://localhost:5173 (Local)
- 后端 API: http://localhost:8000/docs

## 配置

在 `backend` 目录下创建 `.env` 文件设置 API Key:
```env
API_KEY=your_gemini_api_key
DATABASE_URL=postgresql+asyncpg://user:password@localhost/portal_db
```

在 `frontend` 目录下创建 `.env.local` (已包含默认):
```env
VITE_API_BASE_URL=http://localhost:8000
```
