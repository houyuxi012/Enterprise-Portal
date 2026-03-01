# NGEP 产品官网 Cloudflare Pages 部署手册

## 一、前提条件

- 已有 Cloudflare 账户并登录 [Dashboard](https://dash.cloudflare.com/)
- 域名 `houyuxi.com` 已托管在 Cloudflare

---

## 二、创建 D1 数据库

1. Dashboard 左侧菜单 → **Storage & Databases** → **D1 SQL Database**
2. 点击 **Create** → 数据库名填 `ngep-leads-db` → 创建
3. 进入数据库 → **Console** 标签页，粘贴 `docs/schema.sql` 的全部内容并执行
4. 记下数据库 ID（页面上方显示）

---

## 三、部署 Pages 项目

1. Dashboard 左侧菜单 → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. 项目名填 `ngep`（或已有项目直接 Create deployment）
3. **拖入 `产品官网/code/` 文件夹**，确保包含以下文件：

```
code/
├── _worker.js          ← API 逻辑（关键文件）
├── index.html          ← 官网首页（含 SEO 优化）
├── admin.html          ← 线索管理后台
├── robots.txt          ← 搜索引擎爬虫规则
├── sitemap.xml         ← XML 站点地图
├── favicon.ico
├── logo.png
└── images/
    └── footerLogo-DJmhLSCs.png
```

> ⚠️ 上传的是 `code/` 文件夹的**内容**，`_worker.js` 必须在部署根目录

4. 点击 **Deploy** 完成部署

---

## 四、配置 Bindings 和环境变量

部署完成后，进入项目 → **Settings** 标签页：

### 4.1 绑定 D1 数据库

**Settings** → **Bindings** → **Add** → **D1 Database**

| 字段 | 值 |
|------|-----|
| Variable name | `DB` |
| D1 database | 选择 `ngep-leads-db` |

### 4.2 设置环境变量

**Settings** → **Variables and Secrets** → **Add**

| Variable name | 值 | 说明 |
|---------------|-----|------|
| `ADMIN_KEY` | 自定义管理密码 | 后台查询/删除鉴权 |
| `WECHAT_WEBHOOK_URL` | `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key` | 企业微信推送 |
| `CSP_STRICT_STYLE` | 默认 `true`（可选） | 严格样式 CSP（nonce/external）；如需兼容回退可设为 `false` |

> ⚠️ 修改 Settings 后需要**重新部署一次**才能生效（Create deployment → 重新上传文件夹）

---

## 五、绑定自定义域名

**Settings** → **Domains & Routes** → **Add** → **Custom domain**

输入 `ngep.houyuxi.com` → 保存。Cloudflare 会自动配置 DNS 和 SSL。

---

## 六、验证部署

### 6.1 API 接口测试

浏览器访问 `https://ngep.houyuxi.com/api/leads`

- ✅ 返回 `{"error":"未授权访问"}` → API 正常
- ❌ 返回 HTML 页面 → `_worker.js` 未被识别，检查文件是否在根目录

### 6.2 留资表单测试

1. 访问 `https://ngep.houyuxi.com/`
2. 点击「免费试用」→ 填写表单提交
3. 检查企业微信群是否收到 📋 新线索通知

### 6.3 后台管理测试

1. 访问 `https://ngep.houyuxi.com/admin.html`
2. 输入 `ADMIN_KEY` 中设置的密码
3. 验证：查看数据 / 删除线索（应收到 🗑️ 删除通知）/ 导出 CSV（应收到 📊 导出通知）

---

## 七、API 端点汇总

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `POST` | `/api/admin/session` | body: `key` | 登录后台，签发 HttpOnly 会话 Cookie |
| `GET` | `/api/admin/session` | HttpOnly 会话 Cookie | 检查会话是否有效 |
| `DELETE` | `/api/admin/session` | 无（可调用） | 注销后台会话（清除 Cookie） |
| `POST` | `/api/leads` | 无（速率限制：5次/分钟/IP） | 提交线索 + 企微通知 |
| `GET` | `/api/leads` | HttpOnly 会话 Cookie | 查询所有线索 |
| `DELETE` | `/api/leads?id=1` | HttpOnly 会话 Cookie | 删除线索 + 企微通知 |
| `GET` | `/api/rate-limits` | HttpOnly 会话 Cookie | 查看限流统计 |
| `POST` | `/api/notify` | HttpOnly 会话 Cookie | 自定义操作通知（会话/IP 频控 + 最小间隔 + 长度上限） |

---

## 八、数据库表结构

参见 `docs/schema.sql`，关键表如下：

| 表名 | 用途 |
|------|------|
| `leads` | 线索数据存储 |
| `rate_limits` | IP 速率限制计数器（自动清理过期记录） |
| `notify_rate_limits` | 通知接口会话/IP 限流与发送间隔控制 |
| `admin_auth_attempts` | 后台登录尝试计数（按 IP/时间窗） |
| `admin_auth_failures` | 后台登录失败计数（用于锁定策略） |
| `admin_auth_lockouts` | 后台登录临时锁定状态 |

---

## 九、安全特性

| 措施 | 说明 |
|------|------|
| CORS 限定域名 | 仅允许 `https://ngep.houyuxi.com` |
| 安全响应头 | HSTS / CSP / X-Frame-Options / X-XSS-Protection |
| 输入 Sanitize | 去除 HTML 标签，500 字符上限 |
| 手机/邮箱格式校验 | 正则验证 |
| IP 速率限制 | D1 全局一致，每 IP 每分钟 5 次 |
| 通知接口限流 | `/api/notify` 每 IP 每分钟 6 次、每会话每分钟 10 次、同会话最小间隔 10 秒 |
| 通知长度限制 | 标题最大 80 字符，消息最大 1200 字符 |
| 登录/通知请求体限制 | `/api/admin/session` 最大 8KB，`/api/notify` 最大 16KB，超限返回 413 |
| 后台登录防爆破 | `/api/admin/session` 每 IP 每分钟 8 次、最小间隔 2 秒、10 分钟内失败 10 次锁定 15 分钟；全站 10 分钟失败 50 次触发全局锁定 10 分钟 |
| 请求体大小限制 | 10KB 上限 |
| 暴力破解防护 | 鉴权失败延迟 500ms |
| 错误信息脱敏 | 不暴露内部错误 |
| 会话安全 | ADMIN_KEY 不持久化，登录后仅使用 HttpOnly Cookie |
| 样式策略收敛 | 默认启用 nonce 样式模式并禁用 `style` 属性内联；可通过 `CSP_STRICT_STYLE=false` 兼容回退 |
| DELETE 方法 | 副作用操作使用正确的 HTTP 方法 |

---

## 十、日常维护

| 操作 | 方法 |
|------|------|
| 更新页面内容 | 修改 `index.html` 后重新上传部署 |
| 更新 API 逻辑 | 修改 `_worker.js` 后重新上传部署 |
| 查看线索数据 | 访问 `admin.html` 或 Dashboard 中 D1 Console |
| 导出数据 | `admin.html` 页面点击「导出 CSV」 |
| 修改管理密码 | Settings → Variables → 修改 `ADMIN_KEY` → 重新部署 |
| 修改 Webhook | Settings → Variables → 修改 `WECHAT_WEBHOOK_URL` → 重新部署 |
| SEO 站点验证 | 将验证码填入 `index.html` 对应的 `content=""` 字段 |

### SEO 待验证站点

| 平台 | meta 标签 | 站长平台地址 |
|------|-----------|-------------|
| Google | — (自动) | [Google Search Console](https://search.google.com/search-console/) |
| Bing | `msvalidate.01` | [Bing Webmaster](https://www.bing.com/webmasters/) |
| 百度 | — (自动) | [百度站长平台](https://ziyuan.baidu.com/) |
| 今日头条 | `bytedance-verification-code` | [头条站长平台](https://om.toutiao.com/) |
