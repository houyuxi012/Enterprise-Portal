# Operations Runbook

## 常用运维动作

- 查看服务状态
- 启动服务
- 停止服务
- 重启服务
- 查看健康检查结果
- 查看安装和升级日志
- 执行卸载

## 常用命令

```bash
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/status
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/healthcheck
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/acceptance
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/restart
```

## 卸载

默认安全卸载：

```bash
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/uninstall
```

默认行为：

- 停止并禁用 `hyx-portal`
- 删除 `/opt/HYX/Next-Gen-Enterprise-Portal/releases`
- 删除 `current` 和 `previous` 软链接
- 删除 `/run/HYX/Next-Gen-Enterprise-Portal`
- 默认保留配置、数据、日志、Docker 镜像

彻底清理：

```bash
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/uninstall --purge-all
```

按需清理：

```bash
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/uninstall --purge-data
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/uninstall --purge-config --purge-logs
/opt/HYX/Next-Gen-Enterprise-Portal/current/bin/uninstall --purge-images
```

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
