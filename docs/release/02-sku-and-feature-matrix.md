# SKU And Feature Matrix

## SKU 定义

### Core

- `frontend`
- `backend`
- `db`
- `redis`
- `minio`
- `createbuckets`

### Full

- Core 全量能力
- `loki`
- `grafana`

## 脱网功能矩阵

| 功能 | Core | Full | 状态 | 备注 |
|---|---|---|---|---|
| 门户登录与会话 | Yes | Yes | 可用 | 依赖本地 DB 和 Redis |
| 管理端与 RBAC | Yes | Yes | 可用 | 不依赖公网 |
| 文件上传与对象存储 | Yes | Yes | 可用 | 依赖 MinIO |
| 审计日志入库 | Yes | Yes | 可用 | DB 路径可用 |
| Loki 检索 | No | Yes | 可用 | Full only |
| Grafana 面板 | No | Yes | 可用 | Full only |
| LDAP | Conditional | Conditional | 条件可用 | 依赖客户内网 LDAP |
| SMTP | Conditional | Conditional | 条件可用 | 依赖客户内网 SMTP |
| Gemini / 外部 AI | No | No | 禁用 | 脱网默认关闭 |
| 公网短信 | No | No | 禁用 | 脱网默认关闭 |

## 产品策略

- 首个发行版默认交付 `core`。
- `full` 仅在客户明确需要可观测性时交付。
- 脱网默认禁用所有公网依赖能力，不能只在失败时回退。
