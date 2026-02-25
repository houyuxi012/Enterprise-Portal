# 企业门户版本控制策略

## 1. 版本格式

我们遵循 [语义化版本控制 2.0.0 (Semantic Versioning 2.0.0)](https://semver.org/)，并扩展了构建元数据和渠道信息。

格式：`MAJOR.MINOR.PATCH-[CHANNEL].[BUILD_ID]`

### 组成部分
- **MAJOR（主版本号）**：不兼容的 API 修改。
- **MINOR（次版本号）**：向下兼容的功能性新增。
- **PATCH（修订号）**：向下兼容的 Bug 修复。
- **CHANNEL（渠道）**：发布渠道（`stable` 稳定版, `beta` 测试版, `dev` 开发版, `nightly` 每日构建版）。
- **BUILD_ID（构建标识）**：全局唯一的构建标识符（格式：`YYYYMMDDHHMMSS`）。

**示例：** `2.5.0-beta.20260211163045`

### 扩展元数据
- **Product ID（产品 ID）**：`enterprise-portal`
- **Release ID（发布 ID）**：`R{日期}-{BUILD_ID}`（例如：`R20260211-...`）
- **Dirty Flag（脏状态标记）**：指示该构建是否从包含未提交更改的源代码树生成。

---

## 2. 组件版本控制

| 组件 | 版本来源 | 描述 |
|-----------|----------------|-------------|
| **产品 (Product)** | `VERSION` 环境变量 | 整体产品的发布版本。 |
| **后端 API (Backend API)** | `api_version` | 当前 API 定义版本（例如：`v1`）。 |
| **数据库 (Database)** | `db_schema_version` | 架构迁移版本（例如：`1.0.2` 或 Alembic 修订号）。 |

---

## 3. 自动化工作流

`scripts/gen_version.sh` 脚本是唯一的数据源（Single Source of Truth）。

### 用法
```bash
# 开发环境（默认）
./scripts/gen_version.sh

# 生产环境 / CI 构建
export VERSION="2.5.0"
export CHANNEL="stable"
export BUILD_NUMBER="${CI_JOB_ID}"
./scripts/gen_version.sh
```

### 生成的产物 (`backend/VERSION.json`)
```json
{
  "product": "Next-Gen Enterprise Portal",
  "product_id": "enterprise-portal",
  "version": "2.5.0-beta.20260211...",
  "semver": "2.5.0",
  "channel": "beta",
  "git_sha": "03b2953",
  "dirty": false,
  "build_id": "20260211...",
  "release_id": "R20260211-...",
  "api_version": "v1",
  "db_schema_version": "1.0.2"
}
```

---

## 4. 升级审计

系统在启动时会自动检测升级：
1. 读取 `backend/VERSION.json`。
2. 与数据库（`system_config` 表）中的 `sys_version` 进行比较。
3. 如果发生变化：
   - 记录一条 `SYSTEM_UPDATE` 审计日志（严重程度：业务/系统级别）。
   - 在数据库中保存最新的 `sys_version`。

### 审计日志示例
```json
{
  "action": "SYSTEM_UPDATE",
  "detail": "Version upgraded from 2.4.9 to 2.5.0-beta.2026021101",
  "operator": "system_upgrade",
  "source": "SYSTEM"
}
```
