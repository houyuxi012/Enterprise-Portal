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
- `/etc/HYX/Next-Gen-Enterprise-Portal/secrets/source/initial_admin_password` 默认写入 `ngep#HYX`

## 初始管理员密码

- 默认值：`ngep#HYX`
- 生效时机：仅首次安装且密码文件不存在时
- 覆盖规则：若目标机上已存在 `initial_admin_password` 文件，安装器不会覆盖

## 首次验收

- HTTPS 首页可访问
- API 可访问
- 管理员可登录
- 基础上传链路可用
- 审计链路正常
