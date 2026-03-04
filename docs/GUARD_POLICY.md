# Guard Policy（发布门禁策略）

## 1. 目标

确保架构重构后的边界规则在本地、CI、发布分支全流程一致执行，避免：

- 旧导入路径回流
- `App.tsx` 再次膨胀为“超级入口”
- PR 与发布环境门禁强度不一致

## 2. 统一执行入口

统一命令：

```bash
bash scripts/guard_all.sh --mode normal --scope all --output plain
```

可选参数：

- `--mode normal|strict`
- `--scope all|backend|frontend`
- `--output plain|json`
- `--report-dir <dir>`（输出 JSON 诊断报告）

## 3. CI 分级策略

- Pull Request：仅执行 `normal`
- Push 到 `main/master/release/*`：执行 `normal + strict`
- `workflow_dispatch`：执行 `normal + strict`

对应 workflow：

- `/.github/workflows/backend-architecture-guard.yml`
- `/.github/workflows/frontend-structure-guard.yml`

## 4. 模式定义

### normal

- 日常开发门禁，保证重构边界不回退
- 允许合理重构过程中的渐进式调整

### strict

- 发布级门禁，规则更严格
- 用于主分支与发布分支前的最终约束

## 5. 配置文件

- 前端：`/Next-Gen Enterprise Portal/frontend/scripts/structure-guard.config.json`
- 后端：`/Next-Gen Enterprise Portal/backend/scripts/architecture-guard.config.json`

说明：

- 两个配置均采用 `modes` 分层结构（`normal/strict`）
- guard 脚本会做配置 schema 校验（字段缺失/类型错误/正则非法会直接失败）

## 6. 变更与回滚要求

对 guard 阈值/规则的任何修改，必须在 PR 描述中包含：

1. 修改原因（为何需要放宽/收紧）
2. 影响范围（backend/frontend，normal/strict）
3. 回滚方案（恢复到哪个配置版本）

推荐：

- 先在 `strict` 验证新规则，再决定是否下沉到 `normal`
- 不允许直接删除规则，除非有替代规则并说明迁移路径

## 7. 分支保护建议（仓库设置）

在 GitHub Branch Protection 将下列 check 设为 Required：

- `architecture-guard (normal)`
- `structure-guard (normal)`
- `architecture-guard (strict)`（主分支/发布分支）
- `structure-guard (strict)`（主分支/发布分支）

> 该项需在 GitHub 仓库设置中手工启用，无法仅通过代码仓库文件自动生效。
