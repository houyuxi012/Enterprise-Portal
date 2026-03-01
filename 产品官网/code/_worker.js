// Cloudflare Pages Advanced Mode (_worker.js)
// Direct Upload 兼容方案
//
// 环境变量 (在 Pages → Settings → Variables and Secrets 中配置):
//   ADMIN_KEY           — 后台查询密钥
//   WECHAT_WEBHOOK_URL  — 企业微信机器人 Webhook 地址

// ============ 安全配置 ============
const SECURITY_HEADERS_BASE = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    // Microsoft Azure 特征头（CMS 识别）
    'X-Powered-By': 'ASP.NET',
    'X-AspNet-Version': '4.0.30319',
    'X-Azure-Ref': '0t8a3f2e1c0b9a8d7',
    'Server': 'Microsoft-IIS/10.0',
    // Amazon CloudFront 特征头
    'X-Amz-Cf-Id': 'nGePx3B8r2kF7dQ1vL9mHsW4pJ6tYcA5uR0eI-K=',
    'X-Amz-Cf-Pop': 'SIN52-P2',
    'Via': '1.1 a3b8d1e2f4c6.cloudfront.net (CloudFront)',
    'X-Cache': 'Hit from cloudfront',
};

function isTruthy(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function buildCspHeader(nonce, strictStyleMode = true) {
    const styleSrc = strictStyleMode
        ? `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com https://unpkg.com`
        : "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com";
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' https://cdn.tailwindcss.com https://unpkg.com https://fonts.googleapis.com`,
        styleSrc,
        "style-src-attr 'none'",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self' https://ngep.houyuxi.com",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
    ].join('; ');
}

function buildSecurityHeaders(nonce, env) {
    const strictStyleMode = env?.CSP_STRICT_STYLE == null ? true : isTruthy(env?.CSP_STRICT_STYLE);
    return {
        ...SECURITY_HEADERS_BASE,
        'Content-Security-Policy': buildCspHeader(nonce, strictStyleMode),
    };
}

const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://ngep.houyuxi.com',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// ============ 输入校验 ============
function sanitize(str, maxLength = 500) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/[<>]/g, '').slice(0, maxLength);
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

// ============ /api/notify 保护策略 ============
const NOTIFY_WINDOW_MS = 60_000; // 1 分钟窗口
const NOTIFY_MAX_PER_IP = 6;
const NOTIFY_MAX_PER_SESSION = 10;
const NOTIFY_MIN_INTERVAL_MS = 10_000; // 同会话最小发送间隔
const NOTIFY_TITLE_MAX_LENGTH = 80;
const NOTIFY_MESSAGE_MAX_LENGTH = 1200;
const NOTIFY_CLEANUP_WINDOW = NOTIFY_WINDOW_MS * 3;
const NOTIFY_MAX_BODY_BYTES = 16 * 1024;
let notifyLimitTableReady = false;

// ============ /api/admin/session 保护策略 ============
const ADMIN_AUTH_WINDOW_MS = 60_000; // 每分钟
const ADMIN_AUTH_MAX_PER_IP = 8;
const ADMIN_AUTH_MIN_INTERVAL_MS = 2_000; // 同 IP 最小尝试间隔
const ADMIN_AUTH_FAILURE_WINDOW_MS = 10 * 60_000; // 连续失败统计窗口
const ADMIN_AUTH_FAILURE_THRESHOLD = 10;
const ADMIN_AUTH_LOCK_DURATION_MS = 15 * 60_000; // 触发阈值后锁定时长
const ADMIN_AUTH_GLOBAL_KEY = '__global__';
const ADMIN_AUTH_GLOBAL_FAILURE_THRESHOLD = 50; // 全站失败阈值（窗口内）
const ADMIN_AUTH_GLOBAL_LOCK_DURATION_MS = 10 * 60_000; // 全站锁定时长
const ADMIN_AUTH_CLEANUP_WINDOW = 24 * 60 * 60_000;
const ADMIN_SESSION_MAX_BODY_BYTES = 8 * 1024;
let adminAuthTablesReady = false;

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

async function ensureNotifyLimitTable(env) {
    if (notifyLimitTableReady) return;
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS notify_rate_limits (
            key TEXT PRIMARY KEY,
            scope TEXT NOT NULL,
            identifier TEXT NOT NULL,
            window_start INTEGER NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            last_seen INTEGER NOT NULL
        )
    `).run();
    await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_notify_limits_window_start
        ON notify_rate_limits(window_start)
    `).run();
    await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_notify_limits_scope_identifier
        ON notify_rate_limits(scope, identifier)
    `).run();
    notifyLimitTableReady = true;
}

async function sha256Base64Url(value) {
    const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(String(value || '')));
    return toBase64Url(new Uint8Array(digest));
}

async function increaseNotifyCounter(env, scope, identifier, maxPerWindow, now, windowStart) {
    const key = `${scope}:${identifier}:${windowStart}`;
    await env.DB.prepare(`
        INSERT INTO notify_rate_limits (key, scope, identifier, window_start, count, last_seen)
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
            count = count + 1,
            last_seen = excluded.last_seen
    `).bind(key, scope, identifier, windowStart, now).run();

    const row = await env.DB.prepare(
        `SELECT count FROM notify_rate_limits WHERE key = ?`
    ).bind(key).first();
    const count = Number(row?.count || 0);
    return {
        exceeded: count > maxPerWindow,
        count,
    };
}

async function enforceNotifyPolicy(env, ip, sessionToken) {
    const now = Date.now();
    const windowStart = Math.floor(now / NOTIFY_WINDOW_MS) * NOTIFY_WINDOW_MS;
    const sessionId = await sha256Base64Url(sessionToken);

    await ensureNotifyLimitTable(env);
    await env.DB.prepare(
        `DELETE FROM notify_rate_limits WHERE window_start < ?`
    ).bind(windowStart - NOTIFY_CLEANUP_WINDOW).run();

    const lastSessionRow = await env.DB.prepare(
        `SELECT last_seen FROM notify_rate_limits WHERE scope = 'session' AND identifier = ? ORDER BY last_seen DESC LIMIT 1`
    ).bind(sessionId).first();
    const lastSeen = Number(lastSessionRow?.last_seen || 0);
    if (lastSeen > 0 && now - lastSeen < NOTIFY_MIN_INTERVAL_MS) {
        return {
            allowed: false,
            status: 429,
            message: '通知发送过于频繁，请稍后再试',
            retryAfterSeconds: Math.max(1, Math.ceil((NOTIFY_MIN_INTERVAL_MS - (now - lastSeen)) / 1000)),
        };
    }

    const sessionCounter = await increaseNotifyCounter(
        env,
        'session',
        sessionId,
        NOTIFY_MAX_PER_SESSION,
        now,
        windowStart,
    );
    if (sessionCounter.exceeded) {
        return {
            allowed: false,
            status: 429,
            message: '通知发送次数超限，请稍后再试',
            retryAfterSeconds: Math.max(1, Math.ceil(NOTIFY_WINDOW_MS / 1000)),
        };
    }

    const ipCounter = await increaseNotifyCounter(
        env,
        'ip',
        ip || 'unknown',
        NOTIFY_MAX_PER_IP,
        now,
        windowStart,
    );
    if (ipCounter.exceeded) {
        return {
            allowed: false,
            status: 429,
            message: '当前来源发送过于频繁，请稍后再试',
            retryAfterSeconds: Math.max(1, Math.ceil(NOTIFY_WINDOW_MS / 1000)),
        };
    }

    return { allowed: true };
}

async function ensureAdminAuthTables(env) {
    if (adminAuthTablesReady) return;
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS admin_auth_attempts (
            key TEXT PRIMARY KEY,
            ip TEXT NOT NULL,
            window_start INTEGER NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            last_seen INTEGER NOT NULL
        )
    `).run();
    await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_admin_auth_attempts_window_start
        ON admin_auth_attempts(window_start)
    `).run();
    await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_admin_auth_attempts_ip
        ON admin_auth_attempts(ip)
    `).run();

    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS admin_auth_failures (
            key TEXT PRIMARY KEY,
            ip TEXT NOT NULL,
            window_start INTEGER NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            last_seen INTEGER NOT NULL
        )
    `).run();
    await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_admin_auth_failures_window_start
        ON admin_auth_failures(window_start)
    `).run();
    await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_admin_auth_failures_ip
        ON admin_auth_failures(ip)
    `).run();

    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS admin_auth_lockouts (
            ip TEXT PRIMARY KEY,
            locked_until INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `).run();
    await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_admin_auth_lockouts_locked_until
        ON admin_auth_lockouts(locked_until)
    `).run();
    adminAuthTablesReady = true;
}

async function increaseAdminCounter(env, tableName, key, ip, windowStart, now) {
    await env.DB.prepare(`
        INSERT INTO ${tableName} (key, ip, window_start, count, last_seen)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
            count = count + 1,
            last_seen = excluded.last_seen
    `).bind(key, ip, windowStart, now).run();

    const row = await env.DB.prepare(
        `SELECT count FROM ${tableName} WHERE key = ?`
    ).bind(key).first();
    return Number(row?.count || 0);
}

async function cleanupAdminAuthRecords(env, now) {
    await env.DB.prepare(
        `DELETE FROM admin_auth_attempts WHERE window_start < ?`
    ).bind(now - ADMIN_AUTH_CLEANUP_WINDOW).run();
    await env.DB.prepare(
        `DELETE FROM admin_auth_failures WHERE window_start < ?`
    ).bind(now - ADMIN_AUTH_CLEANUP_WINDOW).run();
    await env.DB.prepare(
        `DELETE FROM admin_auth_lockouts WHERE locked_until < ?`
    ).bind(now).run();
}

async function enforceAdminAuthAttemptPolicy(env, ip) {
    const now = Date.now();
    const safeIp = ip || 'unknown';
    await ensureAdminAuthTables(env);
    await cleanupAdminAuthRecords(env, now);

    const globalLockRow = await env.DB.prepare(
        `SELECT locked_until FROM admin_auth_lockouts WHERE ip = ?`
    ).bind(ADMIN_AUTH_GLOBAL_KEY).first();
    const globalLockedUntil = Number(globalLockRow?.locked_until || 0);
    if (globalLockedUntil > now) {
        return {
            allowed: false,
            status: 429,
            message: '系统登录保护已触发，请稍后重试',
            retryAfterSeconds: Math.max(1, Math.ceil((globalLockedUntil - now) / 1000)),
        };
    }

    const lockRow = await env.DB.prepare(
        `SELECT locked_until FROM admin_auth_lockouts WHERE ip = ?`
    ).bind(safeIp).first();
    const lockedUntil = Number(lockRow?.locked_until || 0);
    if (lockedUntil > now) {
        return {
            allowed: false,
            status: 429,
            message: '登录尝试过多，请稍后重试',
            retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil - now) / 1000)),
        };
    }

    const latestRow = await env.DB.prepare(
        `SELECT MAX(last_seen) AS last_seen FROM admin_auth_attempts WHERE ip = ?`
    ).bind(safeIp).first();
    const lastSeen = Number(latestRow?.last_seen || 0);
    if (lastSeen > 0 && now - lastSeen < ADMIN_AUTH_MIN_INTERVAL_MS) {
        return {
            allowed: false,
            status: 429,
            message: '操作过于频繁，请稍后再试',
            retryAfterSeconds: Math.max(1, Math.ceil((ADMIN_AUTH_MIN_INTERVAL_MS - (now - lastSeen)) / 1000)),
        };
    }

    const windowStart = Math.floor(now / ADMIN_AUTH_WINDOW_MS) * ADMIN_AUTH_WINDOW_MS;
    const windowKey = `${safeIp}:${windowStart}`;
    const count = await increaseAdminCounter(
        env,
        'admin_auth_attempts',
        windowKey,
        safeIp,
        windowStart,
        now
    );
    if (count > ADMIN_AUTH_MAX_PER_IP) {
        return {
            allowed: false,
            status: 429,
            message: '登录尝试过于频繁，请稍后再试',
            retryAfterSeconds: Math.max(1, Math.ceil(ADMIN_AUTH_WINDOW_MS / 1000)),
        };
    }
    return { allowed: true };
}

async function recordAdminAuthFailure(env, ip) {
    const now = Date.now();
    const safeIp = ip || 'unknown';
    await ensureAdminAuthTables(env);

    const failureWindowStart = Math.floor(now / ADMIN_AUTH_FAILURE_WINDOW_MS) * ADMIN_AUTH_FAILURE_WINDOW_MS;
    const failureKey = `${safeIp}:${failureWindowStart}`;
    const failCount = await increaseAdminCounter(
        env,
        'admin_auth_failures',
        failureKey,
        safeIp,
        failureWindowStart,
        now
    );

    if (failCount >= ADMIN_AUTH_FAILURE_THRESHOLD) {
        const lockedUntil = now + ADMIN_AUTH_LOCK_DURATION_MS;
        await env.DB.prepare(`
            INSERT INTO admin_auth_lockouts (ip, locked_until, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(ip) DO UPDATE SET
                locked_until = excluded.locked_until,
                updated_at = excluded.updated_at
        `).bind(safeIp, lockedUntil, now).run();
        return { locked: true, lockedUntil, globalLocked: false, globalLockedUntil: 0 };
    }
    const globalFailureWindowStart = Math.floor(now / ADMIN_AUTH_FAILURE_WINDOW_MS) * ADMIN_AUTH_FAILURE_WINDOW_MS;
    const globalFailureKey = `${ADMIN_AUTH_GLOBAL_KEY}:${globalFailureWindowStart}`;
    const globalFailCount = await increaseAdminCounter(
        env,
        'admin_auth_failures',
        globalFailureKey,
        ADMIN_AUTH_GLOBAL_KEY,
        globalFailureWindowStart,
        now
    );
    if (globalFailCount >= ADMIN_AUTH_GLOBAL_FAILURE_THRESHOLD) {
        const globalLockedUntil = now + ADMIN_AUTH_GLOBAL_LOCK_DURATION_MS;
        await env.DB.prepare(`
            INSERT INTO admin_auth_lockouts (ip, locked_until, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(ip) DO UPDATE SET
                locked_until = excluded.locked_until,
                updated_at = excluded.updated_at
        `).bind(ADMIN_AUTH_GLOBAL_KEY, globalLockedUntil, now).run();
        return { locked: false, lockedUntil: 0, globalLocked: true, globalLockedUntil };
    }

    return { locked: false, lockedUntil: 0, globalLocked: false, globalLockedUntil: 0 };
}

async function clearAdminAuthFailureState(env, ip) {
    const safeIp = ip || 'unknown';
    await ensureAdminAuthTables(env);
    await env.DB.prepare(`DELETE FROM admin_auth_failures WHERE ip = ?`).bind(safeIp).run();
    await env.DB.prepare(`DELETE FROM admin_auth_lockouts WHERE ip = ?`).bind(safeIp).run();
}

// ============ 咨询事宜映射 ============
const REQUIREMENT_MAP = {
    'product_demo': '产品演示与试用',
    'pricing': '获取报价方案',
    'technical': '技术架构交流',
    'other': '其他合作意向',
};

function mapRequirement(val) {
    return REQUIREMENT_MAP[val] || val;
}

// ============ 工具函数 ============
function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders }
    });
}

function getContentLength(request) {
    const raw = request.headers.get('Content-Length');
    if (!raw) return 0;
    const size = Number.parseInt(raw, 10);
    return Number.isFinite(size) && size > 0 ? size : 0;
}

async function readBodyTextWithLimit(request, maxBytes) {
    const contentLength = getContentLength(request);
    if (contentLength > maxBytes) return { ok: false, status: 413, message: '请求体过大' };

    if (!request.body) return { ok: true, text: '' };

    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            try { await reader.cancel('body too large'); } catch { /* ignore */ }
            return { ok: false, status: 413, message: '请求体过大' };
        }
        chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(bytes);
    return { ok: true, text };
}

async function parseJsonBodyWithLimit(request, maxBytes, emptyFallback = {}) {
    const bodyResult = await readBodyTextWithLimit(request, maxBytes);
    if (!bodyResult.ok) return bodyResult;

    const text = String(bodyResult.text || '').trim();
    if (!text) return { ok: true, value: emptyFallback };
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch {
        return { ok: false, status: 400, message: '请求格式错误' };
    }
}

// ============ 管理后台会话（HttpOnly Cookie） ============
const ADMIN_SESSION_COOKIE = '__Host-ngep_admin_session';
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const ADMIN_SESSION_SKEW_MS = 5 * 60 * 1000;
const textEncoder = new TextEncoder();

function getCookieValue(request, name) {
    const cookie = request.headers.get('Cookie') || '';
    const parts = cookie.split(';');
    for (const rawPart of parts) {
        const part = rawPart.trim();
        if (!part) continue;
        const eqIndex = part.indexOf('=');
        if (eqIndex === -1) continue;
        const k = part.slice(0, eqIndex).trim();
        if (k !== name) continue;
        return part.slice(eqIndex + 1);
    }
    return null;
}

function toBase64Url(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateCspNonce() {
    return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

function injectNoncesIntoHtml(html, nonce) {
    const nonceBootstrap = `<script nonce="${nonce}">(function(){var s=document.currentScript;var n=(s&&(s.nonce||s.getAttribute('nonce')))||'';if(!n)return;window.__CSP_NONCE__=n;var c=document.createElement.bind(document);document.createElement=function(t,o){var e=c(t,o);if(String(t).toLowerCase()==='style'&&!e.getAttribute('nonce'))e.setAttribute('nonce',n);return e};var a=Element.prototype.appendChild;Element.prototype.appendChild=function(ch){if(ch&&ch.tagName==='STYLE'&&!ch.getAttribute('nonce'))ch.setAttribute('nonce',n);return a.call(this,ch)};var i=Node.prototype.insertBefore;Node.prototype.insertBefore=function(ch,ref){if(ch&&ch.tagName==='STYLE'&&!ch.getAttribute('nonce'))ch.setAttribute('nonce',n);return i.call(this,ch,ref)};})();</script>`;
    return String(html)
        .replace(/<head([^>]*)>/i, `<head$1>${nonceBootstrap}`)
        .replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`)
        .replace(/<style(?![^>]*\bnonce=)/gi, `<style nonce="${nonce}"`);
}

function fromBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function timingSafeEqual(left, right) {
    if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) return false;
    if (left.length !== right.length) return false;
    let mismatch = 0;
    for (let i = 0; i < left.length; i++) {
        mismatch |= left[i] ^ right[i];
    }
    return mismatch === 0;
}

async function hmacSign(secret, payload) {
    const key = await crypto.subtle.importKey(
        'raw',
        textEncoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
    return new Uint8Array(signature);
}

async function createAdminSessionToken(env) {
    const issuedAt = Date.now();
    const nonceRaw = crypto.getRandomValues(new Uint8Array(12));
    const nonce = toBase64Url(nonceRaw);
    const payload = `v1.${issuedAt}.${nonce}`;
    const signature = toBase64Url(await hmacSign(env.ADMIN_KEY, payload));
    return `${payload}.${signature}`;
}

async function verifyAdminSessionToken(env, token) {
    if (!token || !env.ADMIN_KEY) return false;
    const parts = String(token).split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') return false;

    const issuedAt = Number(parts[1]);
    if (!Number.isFinite(issuedAt)) return false;

    const now = Date.now();
    if (issuedAt > now + ADMIN_SESSION_SKEW_MS) return false;
    if (now - issuedAt > ADMIN_SESSION_TTL_SECONDS * 1000) return false;

    const payload = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const expected = await hmacSign(env.ADMIN_KEY, payload);

    let provided;
    try {
        provided = fromBase64Url(parts[3]);
    } catch {
        return false;
    }
    return timingSafeEqual(provided, expected);
}

function buildAdminSessionSetCookie(token) {
    return [
        `${ADMIN_SESSION_COOKIE}=${token}`,
        'Path=/',
        `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
    ].join('; ');
}

function buildAdminSessionClearCookie() {
    return [
        `${ADMIN_SESSION_COOKIE}=`,
        'Path=/',
        'Max-Age=0',
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
    ].join('; ');
}

async function isAdminSessionAuthenticated(request, env) {
    const token = getCookieValue(request, ADMIN_SESSION_COOKIE);
    if (!token) return false;
    return verifyAdminSessionToken(env, token);
}

// ============ 企业微信推送 ============
async function notifyWeCom(env, lead) {
    const webhookUrl = env.WECHAT_WEBHOOK_URL;
    if (!webhookUrl) return;
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const content = [
        `## 📋 NGWP官网新线索通知`,
        `> 提交时间：${now}`,
        ``,
        `**姓名**：${lead.name}`,
        `**手机**：${lead.phone}`,
        `**邮箱**：${lead.email}`,
        `**公司**：${lead.company}`,
        `**职位**：${lead.title}`,
        `**咨询事宜**：${mapRequirement(lead.requirement)}`,
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
        const authed = await isAdminSessionAuthenticated(request, env);
        if (!authed) {
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
        const id = url.searchParams.get('id');

        const authed = await isAdminSessionAuthenticated(request, env);
        if (!authed) {
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
                        `## 🗑️ NGEP官网线索删除通知`,
                        `> 操作时间：${now}`,
                        ``,
                        `**已删除线索 #${lead.id}**`,
                        `- 姓名：${lead.name}`,
                        `- 手机：${lead.phone}`,
                        `- 公司：${lead.company}`,
                    ].join('\n');
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ msgtype: 'markdown', markdown: { content } })
                    });
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

        // API 路由：/api/admin/session（使用 ADMIN_KEY 换取 HttpOnly 会话）
        if (url.pathname === '/api/admin/session') {
            if (request.method === 'POST') {
                const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
                try {
                    const guard = await enforceAdminAuthAttemptPolicy(env, clientIP);
                    if (!guard.allowed) {
                        return jsonResponse(
                            { error: guard.message || '登录尝试过于频繁，请稍后再试' },
                            guard.status || 429,
                            { 'Retry-After': String(guard.retryAfterSeconds || 10) }
                        );
                    }
                } catch (error) {
                    console.error('Admin login guard error:', error?.message || error);
                    return jsonResponse({ error: '服务繁忙，请稍后再试' }, 503);
                }

                const bodyParsed = await parseJsonBodyWithLimit(request, ADMIN_SESSION_MAX_BODY_BYTES, {});
                if (!bodyParsed.ok) {
                    return jsonResponse({ error: bodyParsed.message || '请求格式错误' }, bodyParsed.status || 400);
                }
                const body = bodyParsed.value || {};

                try {
                    const key = String(body?.key || '');
                    if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
                        const failureResult = await recordAdminAuthFailure(env, clientIP);
                        await new Promise(r => setTimeout(r, 500));
                        if (failureResult.globalLocked) {
                            return jsonResponse(
                                { error: '系统登录保护已触发，请稍后重试' },
                                429,
                                { 'Retry-After': String(Math.max(1, Math.ceil((failureResult.globalLockedUntil - Date.now()) / 1000))) }
                            );
                        }
                        if (failureResult.locked) {
                            return jsonResponse(
                                { error: '登录尝试过多，请稍后重试' },
                                429,
                                { 'Retry-After': String(Math.max(1, Math.ceil((failureResult.lockedUntil - Date.now()) / 1000))) }
                            );
                        }
                        return jsonResponse({ error: '认证失败' }, 401);
                    }
                    await clearAdminAuthFailureState(env, clientIP);
                    const token = await createAdminSessionToken(env);
                    return jsonResponse(
                        { success: true, message: '登录成功' },
                        200,
                        { 'Set-Cookie': buildAdminSessionSetCookie(token) }
                    );
                } catch (error) {
                    console.error('Admin login state error:', error?.message || error);
                    return jsonResponse({ error: '服务繁忙，请稍后再试' }, 503);
                }
            }

            if (request.method === 'GET') {
                const authed = await isAdminSessionAuthenticated(request, env);
                if (!authed) {
                    return jsonResponse({ success: false, authenticated: false }, 401);
                }
                return jsonResponse({ success: true, authenticated: true });
            }

            if (request.method === 'DELETE') {
                return jsonResponse(
                    { success: true, message: '已退出' },
                    200,
                    { 'Set-Cookie': buildAdminSessionClearCookie() }
                );
            }
        }

        // API 路由：/api/leads
        if (url.pathname.startsWith('/api/leads')) {
            return handleApiLeads(request, env);
        }

        // API 路由：/api/rate-limits（查看速率限制 IP）
        if (url.pathname === '/api/rate-limits' && request.method === 'GET') {
            const authed = await isAdminSessionAuthenticated(request, env);
            if (!authed) {
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
                const authed = await isAdminSessionAuthenticated(request, env);
                if (!authed) {
                    return jsonResponse({ error: '未授权' }, 401);
                }

                const dataParsed = await parseJsonBodyWithLimit(request, NOTIFY_MAX_BODY_BYTES, {});
                if (!dataParsed.ok) {
                    return jsonResponse({ error: dataParsed.message || '请求格式错误' }, dataParsed.status || 400);
                }
                const data = dataParsed.value || {};
                const rawTitle = typeof data?.title === 'string' ? data.title.trim() : '';
                const rawMessage = typeof data?.message === 'string' ? data.message.trim() : '';
                if (!rawMessage) {
                    return jsonResponse({ error: '通知内容不能为空' }, 400);
                }
                if (rawTitle.length > NOTIFY_TITLE_MAX_LENGTH) {
                    return jsonResponse({ error: `通知标题长度不能超过 ${NOTIFY_TITLE_MAX_LENGTH} 个字符` }, 400);
                }
                if (rawMessage.length > NOTIFY_MESSAGE_MAX_LENGTH) {
                    return jsonResponse({ error: `通知内容长度不能超过 ${NOTIFY_MESSAGE_MAX_LENGTH} 个字符` }, 400);
                }

                const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
                const sessionToken = getCookieValue(request, ADMIN_SESSION_COOKIE) || '';
                const policy = await enforceNotifyPolicy(env, clientIP, sessionToken);
                if (!policy.allowed) {
                    return jsonResponse(
                        { error: policy.message || '通知发送过于频繁，请稍后再试' },
                        policy.status || 429,
                        { 'Retry-After': String(policy.retryAfterSeconds || 10) }
                    );
                }

                const webhookUrl = env.WECHAT_WEBHOOK_URL;
                if (webhookUrl) {
                    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                    const content = [
                        `## 📊 ${sanitize(rawTitle, NOTIFY_TITLE_MAX_LENGTH) || '操作通知'}`,
                        `> 时间：${now}`,
                        ``,
                        sanitize(rawMessage, NOTIFY_MESSAGE_MAX_LENGTH),
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
        const nonce = generateCspNonce();
        const securityHeaders = buildSecurityHeaders(nonce, env);
        const contentType = response.headers.get('content-type') || '';

        let newResponse;
        if (contentType.includes('text/html')) {
            const html = await response.text();
            const rewrittenHtml = injectNoncesIntoHtml(html, nonce);
            newResponse = new Response(rewrittenHtml, {
                status: response.status,
                statusText: response.statusText,
                headers: new Headers(response.headers),
            });
        } else {
            newResponse = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: new Headers(response.headers),
            });
        }

        for (const [key, value] of Object.entries(securityHeaders)) {
            newResponse.headers.set(key, value);
        }
        return newResponse;
    }
};
