# Backend 平台化架构说明（Phase 5）

## 1. 目标

将后端从“单层路由 + 根模型导出”演进为可扩展的平台化结构，核心目标：

- 分层清晰：`core / infrastructure / modules / shared`
- 模块边界明确：业务代码按 `iam / admin / portal` 划分
- 防回退：禁止重新引入旧导入路径（`models/schemas/database/dependencies/routers`）

## 2. 当前目录

```text
Next-Gen Enterprise Portal/backend/
├── core/                # 配置、数据库会话、依赖、启动生命周期
├── infrastructure/      # 基础设施适配（redis/postgres/storage）
├── modules/
│   ├── iam/             # 身份、权限、目录身份源、会话
│   ├── admin/           # 后台管理能力
│   └── portal/          # 前台门户能力
├── middleware/          # 网关层 middleware
├── observability/       # 指标、追踪扩展入口
├── shared/              # 跨模块共享模型/分页等
├── services/            # 通用服务实现（按后续规划逐步模块内聚）
└── main.py              # app 创建与路由装配
```

## 3. 导入规范

- 允许：
  - `from core.database import ...`
  - `import modules.models as models`
  - `import modules.schemas as schemas`
  - `from modules.<domain>.routers...`
- 禁止：
  - `from models import ...`
  - `from schemas import ...`
  - `from database import ...`
  - `from dependencies import ...`
  - `from routers...`

## 4. 架构守卫

执行：

```bash
cd "Enterprise Portal"
bash scripts/guard_all.sh --mode normal --scope all --output plain
```

或仅后端执行：

```bash
cd "Next-Gen Enterprise Portal"
python3 backend/scripts/check_architecture_boundaries.py \
  --config backend/scripts/architecture-guard.config.json \
  --mode normal \
  --root backend \
  --extra ../Test_case \
  --extra ../test_db
```

校验内容：

- 旧导入路径检测
- 禁止兼容壳文件重新出现：
  - `backend/models.py`
  - `backend/schemas.py`
  - `backend/database.py`
  - `backend/dependencies.py`
- 阈值/规则配置文件：`backend/scripts/architecture-guard.config.json`
- 支持模式：`normal` / `strict`（`--mode` 或环境变量 `BACKEND_ARCH_GUARD_MODE`）

## 5. CI 门禁

已接入 GitHub Actions：

- `/.github/workflows/backend-architecture-guard.yml`
- `/.github/workflows/frontend-structure-guard.yml`（前端 App 结构门禁）

触发范围：

- `Next-Gen Enterprise Portal/backend/**`
- `Test_case/**`
- `test_db/**`

执行项：

1. 架构边界守卫脚本
2. `compileall` 语法检查

## 6. 本地 Git Hook 门禁

安装：

```bash
cd "Enterprise Portal"
bash scripts/install_git_hooks.sh
```

`pre-push` 自动执行：

1. backend 架构边界守卫
2. backend/Test_case/test_db 语法编译
3. frontend 结构守卫（`App.tsx` 轻量入口约束，配置见 `frontend/scripts/structure-guard.config.json`）

需要临时强门禁时可执行：

```bash
BACKEND_ARCH_GUARD_MODE=strict FRONTEND_STRUCTURE_GUARD_MODE=strict git push
```

完整发布门禁策略见：`docs/GUARD_POLICY.md`
