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
cd "Enterprise Portal/Next-Gen Enterprise Portal"

# 2. 启动所有服务
docker-compose up -d --build

# 3. 导入测试数据
cd ..
bash test_db/import_test_data.sh
cd "Next-Gen Enterprise Portal"

# 4. 访问系统
# 前端: https://127.0.0.1
# 后端 API: https://127.0.0.1/api/docs
# Grafana: http://localhost:3000 (admin / Grafana@houyuxi)

# 默认管理员: admin / admin  
```

---

## 🗄️ 数据库迁移（Alembic）

后端已从“启动时内联 SQL 迁移”切换为 **Alembic 版本化迁移**。  
禁止再在 `backend/core/database.py` 中新增 `ALTER TABLE/CREATE TABLE` 启动迁移逻辑。

### 常用命令

```bash
# 升级到最新版本
docker compose exec -T backend sh -lc "cd /app && alembic -c alembic.ini upgrade head"

# 查看当前版本
docker compose exec -T backend sh -lc "cd /app && alembic -c alembic.ini current"

# 新建迁移（手动编辑 upgrade/downgrade）
docker compose exec -T backend sh -lc "cd /app && alembic -c alembic.ini revision -m 'your_change_name'"
```

### 迁移规范

- 所有 schema 变更必须提交到 `backend/db_migrations/versions/*.py`
- 生产建议在发布前单独执行迁移：`python backend/db_migration.py`
- 默认关闭启动自动迁移：`DB_AUTO_MIGRATE_ON_STARTUP=false`（启动时仅校验当前版本是否已到 head）
- `alembic_version` 表用于追踪已执行版本
- CI 已接入迁移守卫：`/.github/workflows/backend-migration-guard.yml`
- CI 同时校验：若改动 `backend/**/models.py` 或 `backend/shared/base_models.py`，必须同时改动 migration revision 文件

---

## 🔒 安全特性

- **统一入口**: 所有流量通过 HTTPS 443 端口
- **HttpOnly Cookie**: JWT 存储防 XSS
- **CSP 安全策略**: 网关已启用 `Content-Security-Policy`，并移除已废弃的 `X-XSS-Protection`
- **双会话隔离**: `admin_session` / `portal_session` 分离，按 `aud` 严格校验
- **RBAC 权限模型**: 细粒度应用/资源权限控制
- **API Key 加密**: Fernet 对称加密存储
- **限流保护**: Nginx 层 API 限流
- **文件上传安全**: 魔数校验、大小限制

### 基础设施连接安全（Docker Compose）

- Redis 启用密码认证 + TLS（`rediss://`）
- PostgreSQL 启用 `ssl=on`，并通过 `pg_hba.conf` 拒绝非 TLS 连接
- 后端默认使用 TLS URL：
  - `DATABASE_URL=...?...ssl=require`
  - `REDIS_URL=rediss://...`
- 建议通过环境变量覆盖以下凭据：`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`、`REDIS_PASSWORD`

### License 安全配置（当前实现）

- **公钥 Keyring 轮转**: 支持 `LICENSE_ED25519_PUBLIC_KEYS`（`kid -> public_key`）+ `LICENSE_ED25519_ACTIVE_KID`
- **公钥指纹 Pinning**: 支持 `LICENSE_ED25519_PUBLIC_KEY_FINGERPRINTS`（`kid -> sha256(public_key_pem)`），启动即校验
- **签名指纹语义**: 系统与离线生成器统一为 `sha256(canonical_payload_bytes)`（不包含 signature）
- **吊销列表闭环**: 支持导入 revoke-list（`POST /api/admin/system/license/revocations/install/`），默认落盘 `data/license_revocation_list.json`
- **运行时吊销拦截**: 命中吊销后返回 `LICENSE_REVOKED`，并阻断功能访问

### 登录与会话策略（当前实现）

- **登录会话超时（分钟）**: `login_session_timeout_minutes`，用于签发会话 cookie 的 `Max-Age/Expires`
- **会话绝对超时（分钟）**: `login_session_absolute_timeout_minutes`，超过阈值后即使持续活跃也强制重新登录
- **滚动续期**: 前端活跃时每 3 分钟心跳 `POST /api/system/session/ping`，后端在接近过期窗口内自动续签
- **并发会话限制**: `max_concurrent_sessions`，超限返回提示“该用户超过并发设定，请退出其他设备后再次尝试登陆”
- **验证码阈值**: `login_captcha_threshold`，连续失败达到阈值后必须输入验证码
- **锁定方式**: `security_lockout_scope` 支持按账户或按 IP 锁定

### 配置生效说明

- 修改“登录会话超时 / 绝对超时 / 并发会话”后，**新策略对新签发会话生效**；已登录用户需重新登录后按新超时计时。
- 心跳仅在认证失败（`401/419` 或 `SESSION_EXPIRED` / `TOKEN_REVOKED` / `AUDIENCE_MISMATCH`）时触发统一退出；网络抖动或临时 `5xx` 不会强制登出。

---

## ✅ 接口级联调清单（2026-02-12）

新增脚本化安全链路回归清单：`backend/verify_security_chain.py`。  
目标是对“零信任架构 · 身份驱动安全 · 全链路审计”关键路径做可重复验收。

### 执行方式

```bash
docker compose exec -T backend python verify_security_chain.py
```

### 默认配置（可选覆盖）

- `VERIFY_BASE_URL=https://frontend`（容器内走统一入口）
- `VERIFY_SSL=false`（自签证书场景建议保持 false）
- `VERIFY_ADMIN_USER=admin`
- `VERIFY_ADMIN_PASS=admin`

### 覆盖项

- PORTAL 普通用户登录后台接口拒绝：`POST /api/iam/auth/admin/token` -> `403`
- Admin 平面细粒度权限二次校验：无 `sys:user:edit` 调用员工写接口 -> `403`
- 越权拒绝入审计链：`AUTHZ_DENIED` 可在业务日志（`domain=IAM`）查询到
- 权限回收即时生效：回收 `PortalAdmin` 后，原有效 `admin_session` 立即被拒绝
- 会话吊销生效：登出后重放旧 token 被拒绝（`401`）
- 业务日志防污染：客户端非法 `action` 被拒绝（`400`），合法 action 被服务端规范化并强制 `status=SUCCESS`

### 通过标准

脚本输出结尾出现：

```text
ALL CHECKS PASSED
```

---

## ✅ 接口级联调清单（2026-02-11，历史记录）

基于 Docker Compose 运行环境，按“认证 -> 业务 -> 审计”链路完成实测，结果 **13/13 全部通过**。

- 管理端登录：`POST /api/iam/auth/admin/token`（200）
- 门户端登录：`POST /api/iam/auth/portal/token`（200）
- 门户业务日志写入：`POST /api/app/logs/business`（200）
- 系统配置读取：`GET /api/admin/system/config`（200）
- 日志外发配置查询：`GET /api/admin/logs/config`（200）
- 日志外发配置创建：`POST /api/admin/logs/config`（200）
- 日志外发配置删除：`DELETE /api/admin/logs/config/{config_id}`（200）
- 访问日志查询：`GET /api/admin/logs/access?limit=5`（200）
- AI 审计统计：`GET /api/admin/logs/ai-audit/stats/summary`（200）
- AI 审计详情（不存在事件）：`GET /api/admin/logs/ai-audit/{event_id}`（404，符合预期）
- 业务域日志校验：`GET /api/admin/logs/business?domain=BUSINESS`（可检索到门户侧 marker）
- 系统域审计校验：`GET /api/admin/logs/business?domain=SYSTEM`（可检索到关键审计动作）

本轮已核验的关键审计动作：

- `READ_SYSTEM_CONFIG`
- `READ_LOG_FORWARDING_CONFIG`
- `CREATE_LOG_FORWARDING_CONFIG`
- `DELETE_LOG_FORWARDING_CONFIG`
- `READ_ACCESS_LOGS`
- `READ_AI_AUDIT_STATS`
- `READ_AI_AUDIT_DETAIL`

---

## 📁 项目结构

```
Enterprise Portal/
├── Next-Gen Enterprise Portal/         # 主系统代码目录（后端/前端/运维编排）
│   ├── backend/                        # FastAPI 后端（平台化分层）
│   │   ├── core/                       # 配置、数据库会话、依赖、启动生命周期
│   │   ├── infrastructure/             # Redis/PostgreSQL/存储适配层
│   │   ├── modules/                    # 业务模块（iam/admin/portal）
│   │   │   ├── iam/                    # 身份、权限、目录身份源、会话
│   │   │   ├── admin/                  # 后台管理能力（系统/日志/部门等）
│   │   │   └── portal/                 # 前台门户能力（资讯/通知/工具/AI）
│   │   ├── middleware/                 # 许可证门禁、访问日志、链路上下文
│   │   ├── observability/              # 指标与追踪扩展入口
│   │   ├── shared/                     # 跨模块基础类型与表结构片段
│   │   ├── scripts/                    # 运维与数据迁移脚本
│   │   └── main.py                     # 仅负责 app 创建、middleware、router 注册
│   ├── frontend/                       # React + Vite 管理端与门户端
│   ├── ops/                            # Nginx/Loki/Grafana 配置
│   └── docker-compose.yml              # 主系统容器编排文件
├── NGEP-License/                 # 离线 License 生成器（签发/验签/Web 工具）
├── 产品官网/                      # 官网落地页与 Cloudflare Worker/Pages 代码
├── Test_case/                    # 测试用例总目录（功能/集成/联调）
│   ├── backend/                  # 后端测试脚本与用例
│   └── openldap/                 # OpenLDAP 本地联调编排与种子数据
├── test_db/                      # 测试数据与导入脚本
├── docs/                         # 项目文档（架构、版本、运维说明）
│   └── ARCHITECTURE_BACKEND.md  # 后端平台化架构与导入边界规范
├── test_env/                     # 本地测试环境辅助目录
├── .git/                         # Git 元数据目录
└── .pytest_cache/                # pytest 运行缓存目录
```

### 架构守卫（防止旧导入路径回退）

统一执行入口（推荐）：

```bash
cd "Enterprise Portal"
bash scripts/guard_all.sh --mode normal --scope all --output plain
```

后端单独执行：

```bash
cd "Next-Gen Enterprise Portal"
python3 backend/scripts/check_architecture_boundaries.py \
  --config backend/scripts/architecture-guard.config.json \
  --mode normal \
  --root backend \
  --extra ../Test_case \
  --extra ../test_db
```

校验目标：

- 禁止重新引入旧路径导入：`models/schemas/database/dependencies/routers`
- 禁止重新出现兼容壳文件：`backend/models.py`、`backend/schemas.py`、`backend/database.py`、`backend/dependencies.py`
- 阈值/规则配置文件：`backend/scripts/architecture-guard.config.json`
- 支持模式：`normal` / `strict`（可通过 `--mode` 或环境变量 `BACKEND_ARCH_GUARD_MODE` 切换）
- CI 已接入：`/.github/workflows/backend-architecture-guard.yml`

### 前端结构守卫（防止路由逻辑回流到 App.tsx）

前端单独执行：

```bash
cd "Next-Gen Enterprise Portal/frontend"
npm run structure:check
```

校验目标：

- `App.tsx` 保持轻量入口（限制行数与 import 数量）
- 禁止 `App.tsx` 直接导入 `pages/*`、`services/*`、`layouts/*`
- 禁止在 `App.tsx` 做 route-level `React.lazy`
- 阈值/规则配置文件：`frontend/scripts/structure-guard.config.json`
- 支持模式：`normal` / `strict`（可通过 `npm run structure:check:strict` 或环境变量 `FRONTEND_STRUCTURE_GUARD_MODE` 切换）

CI 已接入：`/.github/workflows/frontend-structure-guard.yml`

### 本地 pre-push 守卫

```bash
cd "Enterprise Portal"
bash scripts/install_git_hooks.sh
```

安装后，每次 `git push` 会自动执行：

1. backend 架构守卫
2. backend + Test_case + test_db 语法编译检查
3. frontend 结构守卫

可选：本地临时启用严格模式

```bash
BACKEND_ARCH_GUARD_MODE=strict FRONTEND_STRUCTURE_GUARD_MODE=strict git push
```

更多门禁策略见：`docs/GUARD_POLICY.md`

---

## 🚀 构建与发布 (Build & Release)

在构建 Docker 镜像前，需运行版本生成脚本以注入 Git SHA 和构建时间：

```bash
# 生成后端版本信息 (backend/VERSION.json)
./ops/scripts/gen_version.sh

# 构建镜像
docker-compose build
```

---

## 📝 License

MIT License © 2025 侯钰熙  
<https://www.houyuxi.com>
