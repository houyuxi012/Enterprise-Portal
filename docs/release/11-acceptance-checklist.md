# Acceptance Checklist

## 首次安装验收

- 安装日志完整
- 服务全部健康
- 前端可访问
- API 可访问
- 管理员可登录
- 上传链路可用

推荐先执行发行包内置验收脚本：

```bash
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/acceptance
```

该脚本至少会校验：

- `hyx-portal.service` 为 `active`
- `db`、`redis`、`minio`、`backend`、`frontend` 五个核心服务均为运行态
- `redis` 与 `minio` 容器健康检查为 `healthy`
- `https://<PUBLIC_BASE_URL>/` 返回成功
- `https://<PUBLIC_BASE_URL>/api/v1/public/config` 返回成功
- 初始管理员密码文件存在
- 默认初始管理员密码为 `ngep#HYX`（仅首次创建密码文件时生效）

人工复验命令：

```bash
systemctl status hyx-portal --no-pager -l
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -k -I https://127.0.0.1/
curl -k -I https://127.0.0.1/api/v1/public/config
```

## 升级验收

- 升级前备份完成
- 新版本服务健康
- 核心业务链路正常
- 审计链路正常
- 回滚点已建立

升级后同样先执行：

```bash
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/acceptance
```

## 回滚验收

- `previous` 可用
- 应用可切回旧版本
- 旧版本健康检查通过
- 必要时数据库恢复验证通过

回滚后执行：

```bash
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/acceptance
```

## 脱网验收

- 安装过程无公网访问
- 运行过程无公网依赖
- 禁用功能显示正确
- 外部依赖功能未误开放

建议补充检查：

```bash
grep -n "Installing bundled Docker RPMs" /var/log/HYX/Next-Gen-Enterprise-Portal/install.log || true
grep -n "Health check passed" /var/log/HYX/Next-Gen-Enterprise-Portal/install.log
```
