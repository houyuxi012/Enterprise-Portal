import type { AxiosError } from 'axios';

export const AUTH_SESSION_INVALID_EVENT = 'auth:session-invalid';

export type AuthSessionCode =
  | 'SESSION_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'AUDIENCE_MISMATCH'
  | 'UNAUTHORIZED';

export interface AuthSessionInvalidDetail {
  code: AuthSessionCode;
  message: string;
  redirectTo: '/admin/login' | '/login';
  source?: string;
}

const AUTH_CODES = new Set<string>(['SESSION_EXPIRED', 'TOKEN_REVOKED', 'AUDIENCE_MISMATCH']);
const LOCAL_CACHE_KEYS = [
  'activeAdminTab',
  'iam_permissions_cache',
  'iam_roles_cache',
  'iam_perm_version',
];
const SESSION_CACHE_KEYS = ['iam_permissions_cache', 'iam_roles_cache', 'iam_perm_version'];

let isHandlingSessionInvalid = false;

const normalizeDetail = (rawDetail: unknown): { code?: string; message?: string } => {
  if (!rawDetail) return {};
  if (typeof rawDetail === 'string') return { message: rawDetail };
  if (typeof rawDetail === 'object') {
    const detailObj = rawDetail as Record<string, unknown>;
    const code = typeof detailObj.code === 'string' ? detailObj.code : undefined;
    const message = typeof detailObj.message === 'string' ? detailObj.message : undefined;
    return { code, message };
  }
  return {};
};

const inferRedirectTarget = (requestUrl?: string): '/admin/login' | '/login' => {
  const url = String(requestUrl || '');
  if (url.includes('/admin/')) return '/admin/login';
  if (url.includes('/app/')) return '/login';

  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return '/admin/login';
  }
  return '/login';
};

const defaultMessageByCode = (code: AuthSessionCode): string => {
  if (code === 'TOKEN_REVOKED') return '当前会话已失效，请重新登录。';
  if (code === 'AUDIENCE_MISMATCH') return '当前会话身份不匹配，请重新登录。';
  if (code === 'UNAUTHORIZED') return '未授权访问，请重新登录。';
  return '登录会话已过期，请重新登录。';
};

export const clearAuthClientCache = () => {
  for (const key of LOCAL_CACHE_KEYS) {
    localStorage.removeItem(key);
  }
  for (const key of SESSION_CACHE_KEYS) {
    sessionStorage.removeItem(key);
  }
};

export const resolveAuthErrorInfo = (error: unknown): {
  status?: number;
  code?: string;
  message?: string;
  requestUrl?: string;
} => {
  const axiosError = error as AxiosError<{ detail?: unknown }>;
  const status = axiosError?.response?.status;
  const requestUrl = String(axiosError?.config?.url || '');
  const detail = normalizeDetail(axiosError?.response?.data?.detail);
  return {
    status,
    code: detail.code,
    message: detail.message,
    requestUrl,
  };
};

export const triggerSessionInvalid = (
  error: unknown,
  options?: { source?: string; force?: boolean }
): boolean => {
  if (typeof window === 'undefined') return false;
  if (isHandlingSessionInvalid) return true;

  const { status, code, message, requestUrl } = resolveAuthErrorInfo(error);
  const isAuthStatus = status === 401 || status === 419;
  const hasAuthCode = !!code && AUTH_CODES.has(code);
  const shouldHandle = !!options?.force || isAuthStatus || hasAuthCode;
  if (!shouldHandle) return false;

  const normalizedCode: AuthSessionCode = (code && AUTH_CODES.has(code))
    ? (code as AuthSessionCode)
    : (status === 401 || status === 419 ? 'SESSION_EXPIRED' : 'UNAUTHORIZED');

  const redirectTo = inferRedirectTarget(requestUrl);
  const payload: AuthSessionInvalidDetail = {
    code: normalizedCode,
    message: message || defaultMessageByCode(normalizedCode),
    redirectTo,
    source: options?.source || 'interceptor',
  };

  isHandlingSessionInvalid = true;
  clearAuthClientCache();
  if (window.location.pathname !== redirectTo) {
    window.history.replaceState({}, '', redirectTo);
  }
  window.dispatchEvent(new CustomEvent<AuthSessionInvalidDetail>(AUTH_SESSION_INVALID_EVENT, { detail: payload }));
  window.setTimeout(() => {
    isHandlingSessionInvalid = false;
  }, 1200);
  return true;
};
