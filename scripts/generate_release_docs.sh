#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/docs/release"
FORCE=0
CREATED=0
SKIPPED=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/generate_release_docs.sh [--dest <dir>] [--force]

Options:
  --dest <dir>  Output directory. Defaults to docs/release under repo root.
  --force       Overwrite existing files.
  -h, --help    Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest)
      DEST="${2:-}"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$DEST" != /* ]]; then
  DEST="$ROOT/$DEST"
fi

mkdir -p "$DEST"

write_file() {
  local path="$1"

  if [[ -e "$path" && "$FORCE" -ne 1 ]]; then
    echo "[skip] $path"
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  mkdir -p "$(dirname "$path")"
  cat >"$path"
  echo "[write] $path"
  CREATED=$((CREATED + 1))
}

write_file "$DEST/00-overview.md" <<'EOF'
# Release Overview

## 目标

- 定义 Next-Gen Enterprise Portal 的 Linux 定版离线交付模型。
- 固定交付形态为 Linux 离线 `.bin` 安装包。
- 统一研发、测试、实施、运维的交付口径。

## 范围

- 仅支持 `Rocky Linux 9.x x86_64`。
- 仅支持离线安装、容器化运行、安装期和启动期双重 OS 校验。
- 安装目录、配置目录、数据目录、日志目录均采用固定布局。

## 非目标

- 不支持通用 Linux 任意发行版兼容。
- 不支持目标机在线构建、在线拉取镜像、在线安装插件。
- 不默认支持公网依赖能力，如外部 AI、公网短信、公网 SaaS。

## 交付原则

- 构建发生在联网构建机，安装发生在脱网目标机。
- 交付包必须包含完整离线镜像、配置模板、安装脚本、校验清单。
- 生产运行时只允许读取发行态镜像和正式挂载目录。
EOF

write_file "$DEST/01-support-matrix.md" <<'EOF'
# Support Matrix

## 支持平台

- OS: `Rocky Linux 9.x`
- Architecture: `x86_64`
- Init system: `systemd`

## 最低运行要求

- CPU:
- Memory:
- Disk:
- Docker Engine:
- Docker Compose plugin:
- Kernel:

## 必备系统条件

- root 安装权限
- 时钟同步正常
- SELinux 策略已验证
- 必需端口可用
- `/opt`、`/etc`、`/var/lib`、`/var/log` 可写

## 不支持项

- 非 Rocky Linux 9
- ARM 架构
- 无 systemd 的宿主机
- 运行期在线下载依赖的环境
EOF

write_file "$DEST/02-sku-and-feature-matrix.md" <<'EOF'
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
EOF

write_file "$DEST/03-directory-layout.md" <<'EOF'
# Directory Layout

## 目标目录

- `/opt/HYX/Next-Gen-Enterprise-Portal/releases/<version-build>`
- `/opt/HYX/Next-Gen-Enterprise-Portal/current`
- `/opt/HYX/Next-Gen-Enterprise-Portal/previous`
- `/etc/HYX/Next-Gen-Enterprise-Portal`
- `/var/lib/HYX/Next-Gen-Enterprise-Portal`
- `/var/log/HYX/Next-Gen-Enterprise-Portal`
- `/run/HYX/Next-Gen-Enterprise-Portal`

## 目录职责

### `/opt`

- 保存版本化程序、发行态 compose、运维脚本、版本清单。
- 不保存业务数据。

### `/etc`

- 保存环境配置、证书、许可证、静态 secret 模板。
- 不保存高频变化数据。

### `/var/lib`

- 保存数据库卷、对象存储卷、上传文件、备份文件。
- 升级和重装默认不清理。

### `/var/log`

- 保存安装、升级、回滚、健康检查、运维脚本日志。

### `/run`

- 保存运行期临时文件、锁文件、临时 secrets、状态文件。

## 权限策略

- 程序目录默认 `root:root`
- 敏感配置和密钥默认 `600`
- 非敏感配置默认 `640`
- 临时运行目录在重启后允许重建
EOF

write_file "$DEST/04-release-artifact-spec.md" <<'EOF'
# Release Artifact Spec

## 命名规范

- `Next-Gen-Enterprise-Portal-<version>-rockylinux9-x86_64-offline-core-<build>.bin`
- `Next-Gen-Enterprise-Portal-<version>-rockylinux9-x86_64-offline-full-<build>.bin`

## 配套交付物

- `.bin`
- `.bin.sha256`
- `.bin.sig`
- `manifest.json`
- `SBOM.json`

## `manifest.json` 必填字段

- `product_name`
- `version`
- `build_id`
- `sku`
- `supported_os`
- `supported_arch`
- `images`
- `services`
- `ports`
- `data_dirs`
- `config_dirs`
- `offline_mode`

## 镜像规则

- 所有镜像必须固定 tag 或 digest。
- 不允许使用 `latest`。
- 不允许目标机安装时拉取公网镜像。

## 校验规则

- 安装前校验发行包摘要。
- 导入后校验镜像 digest。
- 安装日志必须记录版本、构建号、SKU。
EOF

write_file "$DEST/05-installer-sequence.md" <<'EOF'
# Installer Sequence

## 安装时序

1. 执行 `.bin`
2. 解压 payload
3. 读取 `manifest`
4. 执行 `preflight-check`
5. 创建正式目录
6. 释放发行文件
7. 初始化配置
8. 渲染 runtime secrets
9. 导入离线镜像
10. 注册 systemd
11. 建立 `current`
12. 启动服务
13. 执行初始化任务
14. 执行健康检查
15. 输出结果并写日志

## 失败收敛

- 任一步失败即停止安装。
- 不允许进入半安装状态仍返回成功。
- 失败时必须给出明确错误和日志路径。

## 安装器边界

- 只负责解压、校验、安装、启动。
- 不负责目标机上的在线构建。
- 不覆盖已有证书、license、secret。
EOF

write_file "$DEST/06-first-install.md" <<'EOF'
# First Install

## 执行入口

- `./Next-Gen-Enterprise-Portal-<version>-rockylinux9-x86_64-offline-<sku>-<build>.bin`

## 安装前检查

- OS 和架构校验
- Docker / Compose 校验
- 磁盘和内存校验
- 端口占用校验
- root 权限校验

## 安装步骤

1. 创建正式目录
2. 解包发行文件
3. 写入配置模板
4. 导入镜像
5. 注册 systemd
6. 启动服务
7. 执行初始化任务
8. 运行健康检查

## 首次安装产物

- `current` 指向当前版本
- `/etc/HYX/...` 生成初始配置模板
- `/var/lib/HYX/...` 生成数据目录
- `/var/log/HYX/.../install.log` 记录完整过程

## 首次验收

- HTTPS 首页可访问
- API 可访问
- 管理员可登录
- 基础上传链路可用
- 审计链路正常
EOF

write_file "$DEST/07-upgrade-and-rollback.md" <<'EOF'
# Upgrade And Rollback

## 升级前提

- 系统已完成首次安装
- `current` 目录有效
- systemd 服务有效
- 数据目录可读写

## 升级流程

1. 升级前检查
2. 配置备份
3. 数据库备份
4. 解包到新版本目录
5. 导入新镜像
6. 合并配置
7. 执行数据库迁移
8. 记录 `previous`
9. 切换 `current`
10. 启动新版本
11. 执行升级后健康检查

## 回滚流程

1. 停止当前版本
2. 切换 `current -> previous`
3. 启动旧版本
4. 验证健康检查
5. 必要时恢复数据库备份

## 风险边界

- 应用版本可回滚，不代表数据一定可回滚。
- 任何 schema 变更都必须定义回滚策略。
- 升级前数据库备份为强制项。
EOF

write_file "$DEST/08-config-and-secrets.md" <<'EOF'
# Config And Secrets

## 配置分层

- 发行默认值
- 环境级覆盖
- 客户站点级配置
- 运行期动态渲染 secrets

## 配置目录

- `/etc/HYX/Next-Gen-Enterprise-Portal/portal.env`
- `/etc/HYX/Next-Gen-Enterprise-Portal/conf.d/`
- `/etc/HYX/Next-Gen-Enterprise-Portal/certs/`
- `/etc/HYX/Next-Gen-Enterprise-Portal/licenses/`
- `/etc/HYX/Next-Gen-Enterprise-Portal/secrets/`

## 运行时 secrets

- 通过正式脚本渲染
- 权限必须最小化
- 不直接写入版本目录

## 密钥和证书策略

- 私钥文件默认 `600`
- 安装器不覆盖已有证书
- 更换证书必须走受控流程

## 配置变更规则

- 升级时允许补充新增项
- 升级时不得无提示删除客户自定义项
- 敏感配置变更必须写审计日志
EOF

write_file "$DEST/09-network-and-port-policy.md" <<'EOF'
# Network And Port Policy

## 对外端口

- `443`: 默认对外入口
- `80`: 可选，仅用于跳转 HTTPS
- `3000`: 可选，仅在交付独立 Grafana 时开放

## 不建议对外开放

- `5432`
- `6379`
- `8000`
- `3100`
- `9000`
- `9001`

## 网络原则

- 前端作为统一入口
- 后端仅容器网络访问
- DB / Redis / MinIO / Loki 默认不暴露宿主端口

## TLS 策略

- 默认 HTTPS
- 容器间 TLS 视服务能力启用
- 证书目录固定挂载

## 防火墙和隔离

- 默认最小开放面
- 非必要端口不放行
- 运维入口单独审批
EOF

write_file "$DEST/10-operations-runbook.md" <<'EOF'
# Operations Runbook

## 常用运维动作

- 查看服务状态
- 启动服务
- 停止服务
- 重启服务
- 查看健康检查结果
- 查看安装和升级日志

## 日常巡检

- 系统服务状态
- 容器状态
- 磁盘使用率
- 数据备份状态
- 证书有效期
- License 状态

## 常见维护任务

- 更换证书
- 更新 License
- 清理旧版本 release
- 执行手工备份
- 手工执行回滚

## 故障处理

- 服务无法启动
- 镜像导入失败
- 数据库迁移失败
- 健康检查失败
- 证书配置错误
EOF

write_file "$DEST/11-acceptance-checklist.md" <<'EOF'
# Acceptance Checklist

## 首次安装验收

- 安装日志完整
- 服务全部健康
- 前端可访问
- API 可访问
- 管理员可登录
- 上传链路可用

## 升级验收

- 升级前备份完成
- 新版本服务健康
- 核心业务链路正常
- 审计链路正常
- 回滚点已建立

## 回滚验收

- `previous` 可用
- 应用可切回旧版本
- 旧版本健康检查通过
- 必要时数据库恢复验证通过

## 脱网验收

- 安装过程无公网访问
- 运行过程无公网依赖
- 禁用功能显示正确
- 外部依赖功能未误开放
EOF

write_file "$DEST/12-build-and-package-pipeline.md" <<'EOF'
# Build And Package Pipeline

## 构建机职责

- 构建前端发行产物
- 构建后端发行镜像
- 构建 Grafana 自定义镜像和预置插件
- 导出离线镜像包
- 生成 `manifest`、摘要、签名和 SBOM
- 组装 `.bin`

## 目标机职责

- 执行安装器
- 校验 OS 和依赖
- 导入镜像
- 渲染配置
- 启动服务

## 产物流转

1. 联网构建机生成发行物
2. 发行物进入制品库或受控介质
3. 通过离线介质传递到目标机
4. 目标机执行安装或升级

## 关键门禁

- 所有镜像固定版本
- 所有摘要可复现
- 所有交付物通过校验
- 所有发行文档同步更新
EOF

echo
echo "Release doc scaffold complete."
echo "Created: $CREATED"
echo "Skipped: $SKIPPED"
echo "Output : $DEST"
