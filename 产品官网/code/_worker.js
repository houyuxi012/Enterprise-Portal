// Cloudflare Pages Advanced Mode (_worker.js)
// Direct Upload 兼容方案
//
// 环境变量 (在 Pages → Settings → Variables and Secrets 中配置):
//   ADMIN_KEY           — 后台查询密钥
//   WECHAT_WEBHOOK_URL  — 企业微信机器人 Webhook 地址

// ============ 安全配置 ============
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://ngep.houyuxi.com;",
    // Microsoft Azure 特征头（CMS 识别）
    'X-Powered-By': 'ASP.NET',
    'X-AspNet-Version': '4.0.30319',
    'X-Azure-Ref': '0t8a3f2e1c0b9a8d7',
    'Server': 'Microsoft-IIS/10.0',
};

const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://ngep.houyuxi.com',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// ============ 输入校验 ============
function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/[<>]/g, '').slice(0, 500);
}

function isValidPhone(phone) {
    return /^1[3-9]\d{9}$/.test(phone) || /^\+?\d{7,15}$/.test(phone);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// ============ 速率限制（基于 D1，全局一致） ============
const RATE_LIMIT_WINDOW = 60_000; // 1 分钟
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_CLEANUP_WINDOW = RATE_LIMIT_WINDOW * 2;
let rateLimitTableReady = false;

async function ensureRateLimitTable(env) {
    if (rateLimitTableReady) return;
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS rate_limits (
            key TEXT PRIMARY KEY,
            ip TEXT NOT NULL,
            window_start INTEGER NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        )
    `).run();
    await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
        ON rate_limits(window_start)
    `).run();
    rateLimitTableReady = true;
}

async function isRateLimited(env, ip) {
    const now = Date.now();
    const windowStart = Math.floor(now / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW;
    const key = `${ip}:${windowStart}`;

    // 惰性清理过期窗口，避免表无限增长。
    await env.DB.prepare(
        `DELETE FROM rate_limits WHERE window_start < ?`
    ).bind(windowStart - RATE_LIMIT_CLEANUP_WINDOW).run();

    // 原子递增（SQLite UPSERT），保证多实例下计数一致。
    await env.DB.prepare(`
        INSERT INTO rate_limits (key, ip, window_start, count, updated_at)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
            count = count + 1,
            updated_at = excluded.updated_at
    `).bind(key, ip, windowStart, now).run();

    const row = await env.DB.prepare(
        `SELECT count FROM rate_limits WHERE key = ?`
    ).bind(key).first();
    const currentCount = Number(row?.count || 0);
    return currentCount > RATE_LIMIT_MAX;
}

// ============ 工具函数 ============
function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders }
    });
}

// ============ 企业微信推送 ============
async function notifyWeCom(env, lead) {
    const webhookUrl = env.WECHAT_WEBHOOK_URL;
    if (!webhookUrl) return;
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const content = [
        `## 📋 新线索通知`,
        `> 提交时间：${now}`,
        ``,
        `**姓名**：${lead.name}`,
        `**手机**：${lead.phone}`,
        `**邮箱**：${lead.email}`,
        `**公司**：${lead.company}`,
        `**职位**：${lead.title}`,
        `**咨询事宜**：${lead.requirement}`,
    ].join('\n');

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ msgtype: 'markdown', markdown: { content } })
        });
    } catch (e) {
        console.error('WeCom webhook error:', e.message);
    }
}

// ============ API 路由处理 ============
async function handleApiLeads(request, env) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // POST → 写入线索
    if (request.method === 'POST') {
        // 速率限制（D1 全局一致）
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        try {
            await ensureRateLimitTable(env);
            if (await isRateLimited(env, clientIP)) {
                return jsonResponse(
                    { error: '提交过于频繁，请稍后再试' },
                    429,
                    { 'Retry-After': String(Math.ceil(RATE_LIMIT_WINDOW / 1000)) }
                );
            }
        } catch (rateLimitError) {
            console.error('Rate limit check failed:', rateLimitError?.message || rateLimitError);
            return jsonResponse({ error: '服务繁忙，请稍后再试' }, 503);
        }

        try {
            // 防止超大请求体
            const contentLength = parseInt(request.headers.get('Content-Length') || '0');
            if (contentLength > 10240) { // 10KB 上限
                return jsonResponse({ error: '请求体过大' }, 413);
            }

            const data = await request.json();
            const name = sanitize(data.name);
            const phone = sanitize(data.phone);
            const email = sanitize(data.email);
            const company = sanitize(data.company);
            const title = sanitize(data.title);
            const requirement = sanitize(data.requirement);

            // 必填校验
            if (!name || !phone || !email || !company || !title || !requirement) {
                return jsonResponse({ error: '请填写所有必填字段' }, 400);
            }

            // 格式校验
            if (!isValidPhone(phone)) {
                return jsonResponse({ error: '手机号码格式不正确' }, 400);
            }
            if (!isValidEmail(email)) {
                return jsonResponse({ error: '邮箱格式不正确' }, 400);
            }

            const stmt = env.DB.prepare(
                `INSERT INTO leads (name, phone, email, company, title, requirement) VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(name, phone, email, company, title, requirement);
            const result = await stmt.run();

            if (!result.success) throw new Error('Database insertion failed');

            // 推送企业微信
            await notifyWeCom(env, { name, phone, email, company, title, requirement });

            return jsonResponse({ success: true, message: '提交成功' });
        } catch (error) {
            // 不暴露内部错误细节
            console.error('Lead submission error:', error.message);
            return jsonResponse({ error: '提交失败，请稍后重试' }, 500);
        }
    }

    // GET → 查询线索列表（需鉴权）
    if (request.method === 'GET') {
        const key = url.searchParams.get('key');

        if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
            await new Promise(r => setTimeout(r, 500));
            return jsonResponse({ error: '未授权访问' }, 401);
        }

        try {
            const { results } = await env.DB.prepare(
                `SELECT * FROM leads ORDER BY created_at DESC`
            ).all();
            return jsonResponse({ success: true, total: results.length, data: results });
        } catch (error) {
            return jsonResponse({ error: '查询失败' }, 500);
        }
    }

    // DELETE → 删除线索（需鉴权）
    if (request.method === 'DELETE') {
        const key = url.searchParams.get('key');
        const id = url.searchParams.get('id');

        if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
            await new Promise(r => setTimeout(r, 500));
            return jsonResponse({ error: '未授权访问' }, 401);
        }

        if (!id || !/^\d+$/.test(id)) {
            return jsonResponse({ error: '非法参数' }, 400);
        }

        try {
            // 先查出被删线索信息用于通知
            const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(parseInt(id)).first();
            await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(parseInt(id)).run();

            // 推送删除通知到企业微信
            if (lead) {
                const webhookUrl = env.WECHAT_WEBHOOK_URL;
                if (webhookUrl) {
                    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                    const content = [
                        `## 🗑️ 线索删除通知`,
                        `> 操作时间：${now}`,
                        ``,
                        `**已删除线索 #${lead.id}**`,
                        `- 姓名：${lead.name}`,
                        `- 手机：${lead.phone}`,
                        `- 公司：${lead.company}`,
                    ].join('\n');
                    fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ msgtype: 'markdown', markdown: { content } })
                    }).catch(() => { });
                }
            }

            return jsonResponse({ success: true, message: '已删除' });
        } catch (error) {
            return jsonResponse({ error: '删除失败' }, 500);
        }
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// ============ 主入口 ============
export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // API 路由：/api/leads
        if (url.pathname.startsWith('/api/leads')) {
            return handleApiLeads(request, env);
        }

        // API 路由：/api/rate-limits（查看速率限制 IP）
        if (url.pathname === '/api/rate-limits' && request.method === 'GET') {
            const key = url.searchParams.get('key');
            if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
                return jsonResponse({ error: '未授权' }, 401);
            }
            try {
                const now = Date.now();
                const { results } = await env.DB.prepare(
                    `SELECT ip, window_start, count, updated_at FROM rate_limits WHERE window_start >= ? ORDER BY count DESC`
                ).bind(now - RATE_LIMIT_WINDOW * 10).all();
                const data = (results || []).map(r => ({
                    ip: r.ip,
                    count: r.count,
                    limited: r.count > RATE_LIMIT_MAX,
                    window: new Date(r.window_start).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                    lastSeen: new Date(r.updated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                }));
                return jsonResponse({ success: true, limit: RATE_LIMIT_MAX, window: RATE_LIMIT_WINDOW / 1000, data });
            } catch (e) {
                return jsonResponse({ error: '查询失败' }, 500);
            }
        }

        // API 路由：/api/notify（操作通知）
        if (url.pathname === '/api/notify' && request.method === 'POST') {
            try {
                const data = await request.json();
                const key = data.key;
                if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
                    return jsonResponse({ error: '未授权' }, 401);
                }
                const webhookUrl = env.WECHAT_WEBHOOK_URL;
                if (webhookUrl && data.message) {
                    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                    const content = [
                        `## 📊 ${data.title || '操作通知'}`,
                        `> 时间：${now}`,
                        ``,
                        data.message,
                    ].join('\n');
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ msgtype: 'markdown', markdown: { content } })
                    });
                }
                return jsonResponse({ success: true });
            } catch (e) {
                return jsonResponse({ error: '通知失败' }, 500);
            }
        }

        // 静态资源 + 安全响应头注入
        const response = await env.ASSETS.fetch(request);
        const newResponse = new Response(response.body, response);
        for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
            newResponse.headers.set(key, value);
        }
        return newResponse;
    }
};
