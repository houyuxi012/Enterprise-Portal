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
