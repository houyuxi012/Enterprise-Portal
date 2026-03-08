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
