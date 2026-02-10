# Next-Gen Enterprise Portal

> **零信任架构 · 身份驱动安全 · 全链路审计**  
> 新一代企业级 IAM 门户系统，采用 React 19 + Vite 7 + FastAPI + PostgreSQL + MinIO 构建。

Next-Gen Enterprise Portal 是一个集成了**统一身份认证、RBAC 权限管理、多维度日志审计、AI 智能助手**的完整企业工作台。

---

## ✨ 核心功能

### 🖥️ 用户门户
- **现代化仪表盘**: 公告轮播、快捷应用网格、最新动态聚合
- **应用中心**: 统一管理企业内部工具，支持分类、搜索与权限控制
- **团队通讯录**: 可视化组织架构树，快速查找同事
- **AI 智能助手**: 集成 Google Gemini，支持多模态图片上传分析
- **AI 知识库**: RAG 检索增强生成，支持文档入库、切片与向量检索

### 🛡️ 管理后台
- **IAM 身份管理**:
  - 用户生命周期管理 (创建/禁用/密码重置)
  - RBAC 角色权限模型
  - 应用级权限隔离
- **全链路日志审计**:
  - **访问日志**: HTTP 请求记录 (存储于 Loki)
  - **登录审计**: 登录尝试、防爆破检测
  - **业务日志**: 关键操作记录 (含知识库管理审计)
  - **AI 审计**: AI 调用追踪、Token 用量统计与来源筛选 (DB + Loki)
  - **日志外发**: Syslog/Webhook 转发至 SIEM
- **监控体系**: Grafana + Loki 全栈可观测
- **存储服务**: MinIO 对象存储 (S3 兼容)
- **企业个性化**: Logo、系统名称、版权信息配置

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **Frontend** | React 19, Vite 7, Ant Design 6, TailwindCSS 3 |
| **Backend** | FastAPI, Python 3.12+, SQLAlchemy AsyncIO |
| **Database** | PostgreSQL 17 (pgvector), Redis 8 |
| **Storage** | MinIO (S3 兼容) |
| **Observability** | Grafana, Loki |
| **Infrastructure** | Docker Compose, Nginx (HTTPS) |

---

## 🚀 快速开始

```bash
# 1. 克隆项目
git clone <repository-url>
cd Enterprise\ Portal

# 2. 启动所有服务
docker-compose up -d --build

# 3. 导入测试数据
sh import_test_data.sh

# 4. 访问系统
# 前端: https://127.0.0.1
# 后端 API: https://127.0.0.1/api/docs
# Grafana: http://localhost:3000 (admin / Grafana@houyuxi)

# 默认管理员: admin / admin123
```

---

## 🔒 安全特性

- **统一入口**: 所有流量通过 HTTPS 443 端口
- **HttpOnly Cookie**: JWT 存储防 XSS
- **RBAC 权限模型**: 细粒度应用/资源权限控制
- **API Key 加密**: Fernet 对称加密存储
- **限流保护**: Nginx 层 API 限流
- **文件上传安全**: 魔数校验、大小限制

---

## 📁 项目结构

```
Enterprise Portal/
├── backend/           # FastAPI 后端
│   ├── routers/       # API 路由
│   ├── iam/           # IAM 模块 (identity/rbac/audit)
│   ├── services/      # 业务逻辑
│   └── models.py      # 数据模型
├── frontend/          # React 前端
│   ├── pages/         # 页面组件
│   ├── components/    # 通用组件
│   └── services/      # API 客户端
├── nginx/             # Nginx 反代配置
├── grafana/           # Grafana 仪表盘
├── loki/              # Loki 日志配置
└── docker-compose.yml
```

---

## 📝 License

MIT License © 2025 侯钰熙  
https://www.houyuxi.com
