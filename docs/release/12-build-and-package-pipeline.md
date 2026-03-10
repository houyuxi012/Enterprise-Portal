# Build And Package Pipeline

## 目标

- 在联网构建机上生成 `Rocky Linux 9 x86_64` 专用离线安装包
- 产出自解压 `.bin`、`sha256`、staging payload
- 默认打包 Docker Engine / Compose RPM，实现真正一包脱网安装

## 当前范围

- 当前脚本：`scripts/build_offline_bin.sh`
- 当前支持 SKU：`core`
- 当前不支持：`full`
- 当前默认目标平台：`linux/amd64`
- 当前默认目标系统：`rockylinux9 x86_64`

## 构建机前置条件

- `python3`
- `tar`
- `gzip`
- `docker`
- Docker 可用，且本机能访问 Docker socket
- 如需自动拉 Docker RPM，还需要能联网访问 Docker 官方 RPM 源

如果要从源码重新构建前后端镜像，构建机还需要满足项目本身的 Docker build 条件。

## 入口命令

标准入口：

```bash
bash scripts/build_offline_bin.sh
```

查看帮助：

```bash
bash scripts/build_offline_bin.sh --help
```

## 推荐打包方式

### 方式一：直接重建应用镜像并打包

适合正式发版。

```bash
bash scripts/build_offline_bin.sh --build-app-images --docker-rpm-dir build/docker-rpms/rockylinux9-resolved
```

说明：

- 前后端镜像从源码重新构建
- Docker RPM 使用本地缓存目录
- 最终产出真正离线安装包

### 方式二：复用本机已有 amd64 镜像快速打包

适合重复出包、改文档、改安装器逻辑、不改业务镜像内容的场景。

```bash
BACKEND_SOURCE_IMAGE='<已有的 amd64 backend 镜像>' \
FRONTEND_SOURCE_IMAGE='<已有的 amd64 frontend 镜像>' \
bash scripts/build_offline_bin.sh --docker-rpm-dir build/docker-rpms/rockylinux9-resolved
```

说明：

- 不重新构建前后端源码
- 直接复用本机已有的 `amd64` 镜像
- 脚本仍会校验镜像架构，不符合会自动转回重建流程

### 方式三：不内置 Docker RPM

仅适合目标机已经有 Docker / Compose 的场景，不属于“真正一包脱网安装”。

```bash
bash scripts/build_offline_bin.sh --build-app-images --no-fetch-docker-rpms
```

## Docker RPM 处理策略

默认行为：

- 脚本会拉取或复用 Rocky Linux 9 对应的 Docker RPM
- 并将 RPM 打进 `payload/docker-rpms/`
- 安装器在目标机缺少 Docker 时会自动离线安装

推荐本地缓存目录：

```bash
build/docker-rpms/rockylinux9-resolved
```

如果已经准备好本地 RPM 目录，优先显式传入：

```bash
--docker-rpm-dir build/docker-rpms/rockylinux9-resolved
```

## 打包过程实际做的事

1. 调用 `Next-Gen Enterprise Portal/ops/scripts/gen_version.sh` 生成版本信息
2. 读取 `backend/VERSION.json`
3. 准备 `build/<package-stem>/payload/`
4. 复制 release compose、systemd、运维脚本、发布文档
5. 准备离线 Docker RPM
6. 构建或复用前后端镜像
7. 将第三方基础镜像固化为 `amd64`
8. 导出 `backend/frontend/db/redis/minio` 镜像归档
9. 生成 `manifest.json` 和 `SHA256SUMS`
10. 组装自解压 `.bin`

## 产物位置

所有产物都在根目录 `build/` 下：

- `*.bin`：最终离线安装包
- `*.bin.sha256`：最终安装包摘要
- `<package-stem>/`：staging 目录，保留完整 payload

命名格式：

```text
Next-Gen-Enterprise-Portal-<semver>-rockylinux9-x86_64-offline-core-b<build_id>.bin
```

## 打包后自检

### 1. 校验摘要

```bash
sha256sum -c build/<package>.bin.sha256
```

### 2. 只解包不安装

```bash
build/<package>.bin --extract-only /tmp/ngep-offline-check
```

### 3. 检查 payload 关键内容

- `payload/images/`
- `payload/docker-rpms/`
- `payload/release/bin/install`
- `payload/release/bin/acceptance`
- `payload/release/compose/docker-compose.core.yml`
- `payload/manifest/manifest.json`

## 目标机职责

- 执行 `.bin`
- 校验 OS / 架构 / systemd / Docker 条件
- 导入离线镜像
- 首次生成配置和 secrets
- 自动安装 Docker RPM（如目标机缺失）
- 启动服务并执行验收

## 产物流转

1. 联网构建机生成发行物
2. 发行物进入制品库或受控介质
3. 通过离线介质传递到目标机
4. 目标机执行安装或升级
5. 安装后执行 `/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/acceptance`

## 关键门禁

- 所有镜像必须为 `amd64`
- 所有镜像和 RPM 都进入 payload
- 所有交付物生成 `sha256`
- 安装器必须能 `--extract-only`
- 验收脚本必须随包交付
- 发行文档必须同步更新

## 当前已固定的发行约束

- MinIO 容器名：`hyx-ngep-minio-1`
- 默认初始管理员密码：`ngep#HYX`
- 默认验收脚本：`/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/acceptance`
