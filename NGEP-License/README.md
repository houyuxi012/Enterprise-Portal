# NGEP-License

独立离线 License 生成器（用于 `enterprise-portal`）。

## 能力范围

- Ed25519 私钥签名 License
- 生成标准格式文件：`{payload, signature}`
- CLI 子命令：
  - `issue`：签发
  - `verify`：验签
  - `show`：解析展示
  - `revoke-list`：生成吊销列表
- 附加子命令：
  - `gen-keypair`：生成 Ed25519 密钥对（仅生成器环境使用）

## 环境要求

- `python3`（3.10+）
- `openssl`（3.x，支持 Ed25519）

无需额外 Python 依赖安装。

## Canonical JSON 规则（签名输入）

签名时只对 `payload` 做 canonical JSON：

- 键排序：`sort_keys=True`
- 分隔符无空格：`separators=(",", ":")`
- UTF-8 文本：`ensure_ascii=False`，最终按 UTF-8 编码为字节后签名

等价 Python 实现：

```python
canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
signature = private_key.sign(canonical.encode("utf-8"))
```

本工具实际执行签名/验签时使用 `openssl pkeyutl`（Ed25519）：
- 签名：`openssl pkeyutl -sign -rawin ...`
- 验签：`openssl pkeyutl -verify -rawin ...`

## 字段规范（payload）

- `license_id`（格式：`HYX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`，通常以 `HYX` 开头）
- `product_id`
- `product_model`（例如 `NGEPv3.0-HYX-PS`）
- `grant_type`（`formal|trial|learning`）
- `customer`
- `installation_id`
- `issued_at`
- `not_before`
- `expires_at`
- `edition`
- `features`
- `limits.users`
- `rev`

## 用法

### 1) 生成密钥（离线）

```bash
python3 ngep_license_cli.py gen-keypair \
  --private-key-out ./keys/private_key.pem \
  --public-key-out ./examples/public_key.pem
```

### 2) 签发 License

```bash
python3 ngep_license_cli.py issue \
  --private-key ./keys/private_key.pem \
  --output ./examples/license.formal.sample.json \
  --license-id HYX-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY \
  --product-model NGEPv3.0-HYX-PS \
  --grant-type formal \
  --customer "ShiKu Inc." \
  --installation-id "f3c8a7f8-31bf-4d64-bff5-d2ecf23f7f5a" \
  --expires-at "2027-12-31T23:59:59Z" \
  --edition enterprise \
  --features-json '{"ldap":true,"sso":true,"ai.audit":true}' \
  --limits-users 500 \
  --rev 1
```

说明：`product_id` 在生成器中默认固定为 `enterprise-portal`，通常无需手动传入。

### 3) 验签

```bash
python3 ngep_license_cli.py verify \
  --public-key ./examples/public_key.pem \
  --license-file ./examples/license.formal.sample.json
```

### 4) 展示

```bash
python3 ngep_license_cli.py show \
  --license-file ./examples/license.formal.sample.json \
  --canonical
```

### 5) 生成吊销列表（可选）

```bash
python3 ngep_license_cli.py revoke-list \
  --output ./examples/revocation-list.sample.json \
  --product-id enterprise-portal \
  --license-file ./examples/license.formal.sample.json \
  --reason compromised \
  --rev 2
```

## 网页版（本地离线）

启动：

```bash
cd NGEP-License
python3 ngep_license_web.py --host 127.0.0.1 --port 8765
```

访问：

- [http://127.0.0.1:8765](http://127.0.0.1:8765)

网页支持：

- 签发 issue
- 验签 verify
- 展示 show（可输出 canonical payload）
- 吊销列表 revoke-list
- 生成密钥对 gen-keypair
- 签发成功自动下载：`客户名称+LicenseID.bin`（文件内容为 `{payload, signature}` 的 UTF-8 JSON）

## 安全要求

- 私钥只允许存在于 License 生成器环境（本目录）
- 禁止将私钥放入产品容器镜像或业务仓库构建上下文
- 产品侧仅内置公钥（`public_key.pem` 内容）
