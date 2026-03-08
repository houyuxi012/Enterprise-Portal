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
