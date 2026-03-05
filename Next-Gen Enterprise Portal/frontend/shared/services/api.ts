import axios from 'axios';
import type { AxiosResponse } from 'axios';
import {
  Employee,
  NewsItem,
  QuickTool,
  Announcement,
  CarouselItem,
  User,
  Role,
  Permission,
  Department,
  RoleCreate,
  RoleUpdate,
  AIProvider,
  AISecurityPolicy,
  AIModelOption,
  SystemInfo,
  SystemVersion,
  LicenseStatus,
  LicenseClaimsResponse,
  LicenseEventListResponse,
  LicenseRevocationInstallResponse,
  UserOption,
  OnlineUserSession,
  SessionRevokeResult,
} from '@/types';
import { triggerSessionInvalid } from './sessionGuard';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Send Cookies with cross-origin requests
  headers: {
    'Content-Type': 'application/json',
  },
});

const getRuntimeScopePrefix = (): '/app' | '/admin' => {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return '/admin';
  }
  return '/app';
};

const ensureScopedPath = (url: string): string => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;

  const normalized = url.startsWith('/') ? url : `/${url}`;
  if (
    normalized.startsWith('/iam/')
    || normalized.startsWith('/public/')
    || normalized.startsWith('/system/')
    || normalized.startsWith('/mfa/')
    || normalized.startsWith('/portal/')
  ) {
    return normalized;
  }
  if (normalized.startsWith('/admin/') || normalized.startsWith('/app/')) return normalized;

  return `${getRuntimeScopePrefix()}${normalized}`;
};

api.interceptors.request.use((config) => {
  if (config.url) {
    config.url = ensureScopedPath(config.url);
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const handled = triggerSessionInvalid(error, { source: 'api-interceptor' });
    if (!handled) {
      console.error('API Error:', error);
    }
    return Promise.reject(error);
  }
);

// We need an interface for QuickToolDTO because backend returns icon_name string, active types expects ReactNode
export interface QuickToolDTO {
  id: number;
  name: string;
  icon_name: string;
  url: string;
  color: string;
  category: string;
  description: string;
  image?: string;
  sort_order?: number;
  visible_to_departments?: string;
}

export interface QuickToolUpsertPayload {
  name: string;
  icon_name: string;
  url: string;
  color: string;
  category?: string;
  description?: string;
  image?: string;
  sort_order?: number;
  visible_to_departments?: string | null;
}

export interface AnnouncementUpsertPayload {
  tag: string;
  title: string;
  content: string;
  color: string;
  is_urgent?: boolean;
}

export interface ResetPasswordResponse {
  message: string;
  new_password?: string | null;
}

export interface UserNotificationDTO {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'reminder';
  action_url?: string | null;
  created_at?: string;
  is_read: boolean;
  read_at?: string | null;
}

export interface UserCreatePayload {
  username: string;
  password: string;
  email: string;
  role_ids?: number[];
  name?: string;
  is_active?: boolean;
}

export interface UserUpdatePayload {
  email?: string;
  role_ids?: number[];
  is_active?: boolean;
  name?: string;
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

export interface DepartmentCreatePayload {
  name: string;
  parent_id?: number | null;
  manager?: string;
  description?: string;
}

export type DepartmentUpdatePayload = Partial<DepartmentCreatePayload>;

type ApiMessageResponse = {
  message?: string;
} & Record<string, unknown>;

export interface AccessLogEntry {
  id: number;
  timestamp: string;
  trace_id?: string;
  method: string;
  path: string;
  status_code: number;
  ip_address?: string;
  user_agent?: string;
  latency_ms?: number;
}

export interface LogForwardingUpsertPayload {
  type: 'SYSLOG' | 'WEBHOOK';
  endpoint: string;
  port?: number | string;
  secret_token?: string;
  enabled?: boolean;
  log_types?: string[];
}

export interface AIProviderTestResponse {
  status: 'success' | 'failed' | string;
  message?: string;
}

export interface AIAuditLogEntry {
  id: number;
  event_id: string;
  ts: string;
  actor_type?: string;
  actor_id?: number;
  actor_ip?: string;
  action?: string;
  provider?: string;
  model?: string;
  input_policy_result?: string;
  output_policy_result?: string;
  policy_hits?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  status: string;
  error_code?: string;
  error_reason?: string;
  prompt_hash?: string;
  output_hash?: string;
  prompt_preview?: string;
  source?: string;
}

export interface AIAuditQueryParams {
  start_time?: string;
  end_time?: string;
  actor_id?: number;
  provider?: string;
  model?: string;
  status?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

export interface AIModelUsageItem {
  model_name: string;
  is_active: boolean;
  period_tokens?: number;
  peak_daily_tokens?: number;
  current_daily_tokens?: number;
  daily_token_limit?: number;
  daily_request_limit?: number;
}

export interface AIModelQuotaUpdatePayload {
  model_name: string;
  daily_token_limit?: number;
  daily_request_limit?: number;
}

export interface IAMAuditLogItem {
  id: number;
  timestamp: string;
  user_id?: number;
  username?: string;
  action: string;
  target_type?: string;
  target_id?: number;
  target_name?: string;
  detail?: unknown;
  ip_address?: string;
  user_agent?: string;
  result?: string;
  reason?: string;
  trace_id?: string;
  source?: string;
}

export interface IAMAuditQueryParams {
  page?: number;
  page_size?: number;
  source?: string;
  username?: string;
  action?: string;
  result?: string;
  start_time?: string;
  end_time?: string;
}

export interface IAMAuditListResponse {
  total: number;
  page?: number;
  page_size?: number;
  items: IAMAuditLogItem[];
}

export interface KBDocumentSummary {
  id: number;
  title: string;
  source_type: string;
  tags?: string[];
  acl?: string[];
  status: string;
  chunk_count: number;
  created_at: string | null;
}

export interface KBDocumentUpsertPayload {
  title: string;
  content: string;
  source_type: string;
  tags?: string[];
  acl?: string[];
}

export interface KBStatsResponse {
  total_documents: number;
  total_chunks: number;
  total_queries: number;
  strong_hits: number;
  weak_hits: number;
  misses: number;
}

export interface KBReindexResponse {
  message: string;
  id: number;
}

export interface KBQueryChunk {
  chunk_id: number;
  doc_id: number;
  doc_title: string;
  section: string;
  content: string;
  score: number;
}

export interface KBQueryResponse {
  hit_level: 'strong' | 'weak' | 'miss' | string;
  top_score: number;
  chunks: KBQueryChunk[];
}

export interface WebAuthnCredentialDescriptor {
  type: string;
  id: string;
  transports?: string[];
}

export interface WebAuthnRegisterOptions {
  challenge: string;
  rp?: {
    id?: string;
    name?: string;
  };
  user: {
    id: string;
    name: string;
    displayName?: string;
  };
  pubKeyCredParams?: Array<{
    type: string;
    alg: number;
  }>;
  timeout?: number;
  excludeCredentials?: WebAuthnCredentialDescriptor[];
  authenticatorSelection?: Record<string, unknown>;
  attestation?: string;
  extensions?: Record<string, unknown>;
}

export interface WebAuthnRegisterCredentialPayload {
  id: string;
  rawId: string;
  type: string;
  response: {
    attestationObject: string;
    clientDataJSON: string;
    transports?: string[];
  };
}

export interface WebAuthnRegisterVerifyResponse {
  message: string;
  credential: {
    id: number;
    name: string;
    created_at: string | null;
  };
}

export interface WebAuthnAuthOptions {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: WebAuthnCredentialDescriptor[];
  userVerification?: string;
  extensions?: Record<string, unknown>;
}

export const ApiClient = {
  getEmployees: async (): Promise<Employee[]> => {
    const response = await api.get<Employee[]>('/employees/?limit=1000');
    // Safety & Debug Check
    if (!Array.isArray(response.data)) {
      console.error("API Error [getEmployees]: Expected array, got:", response.data);
      const detail = (response.data as { detail?: unknown } | null | undefined)?.detail;
      if (detail) {
        console.error("Auth/Server Error Details:", detail);
      }
      return []; // Fallback to prevent crash
    }
    // Backend returns numeric ID, types use string. We might need casting or refactoring types. 
    // Assuming backend returns proper JSON which JS treats flexibly, but TS might complain.
    return response.data.map(e => ({ ...e, id: String(e.id) })) as unknown as Employee[];
  },

  getNews: async (): Promise<NewsItem[]> => {
    const response = await api.get<NewsItem[]>('/news/');
    if (!Array.isArray(response.data)) {
      console.error("API Error [getNews]: Expected array, got:", response.data);
      return [];
    }
    return response.data.map(n => ({ ...n, id: String(n.id) }));
  },

  getTools: async (adminView?: boolean): Promise<QuickToolDTO[]> => {
    const response = await api.get<QuickToolDTO[]>('/tools/', { params: { admin_view: adminView } });
    return response.data;
  },

  createTool: async (data: QuickToolUpsertPayload): Promise<QuickToolDTO> => {

    const response = await api.post<QuickToolDTO>('/tools/', data);
    return response.data;
  },

  updateTool: async (id: number, data: QuickToolUpsertPayload): Promise<QuickToolDTO> => {

    const response = await api.put<QuickToolDTO>(`/tools/${id}`, data);
    return response.data;
  },

  deleteTool: async (id: number): Promise<void> => {

    await api.delete(`/tools/${id}`);
  },

  uploadImage: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<{ url: string }>('/upload/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.url;
  },

  getAnnouncements: async (): Promise<Announcement[]> => {
    const response = await api.get<Announcement[]>('/announcements/');
    if (!Array.isArray(response.data)) {
      console.error("API Error [getAnnouncements]: Expected array, got:", response.data);
      return [];
    }
    return response.data.map(a => ({ ...a, id: String(a.id) }));
  },

  getAnnouncementReadState: async (): Promise<number[]> => {
    const response = await api.get<{ announcement_ids?: number[] }>('/announcements/read-state');
    return Array.isArray(response.data?.announcement_ids) ? response.data.announcement_ids : [];
  },

  markAnnouncementsRead: async (announcementIds: number[]): Promise<number[]> => {
    const ids = Array.from(new Set((announcementIds || []).filter((id) => Number.isFinite(id))));
    if (ids.length === 0) {
      return [];
    }
    const response = await api.post<{ announcement_ids?: number[] }>('/announcements/read-state', { announcement_ids: ids });
    return Array.isArray(response.data?.announcement_ids) ? response.data.announcement_ids : [];
  },

  getMyNotifications: async (params?: { limit?: number; offset?: number; unread_only?: boolean }): Promise<UserNotificationDTO[]> => {
    const response = await api.get<UserNotificationDTO[]>('/notifications/', { params });
    return Array.isArray(response.data) ? response.data : [];
  },

  markNotificationsRead: async (notificationIds: number[]): Promise<number[]> => {
    const ids = Array.from(new Set((notificationIds || []).filter((id) => Number.isFinite(id))));
    if (ids.length === 0) return [];
    const response = await api.post<{ notification_ids?: number[] }>('/notifications/read', {
      notification_ids: ids,
    });
    return Array.isArray(response.data?.notification_ids) ? response.data.notification_ids : [];
  },

  markAllNotificationsRead: async (): Promise<void> => {
    await api.post('/notifications/read-all', {});
  },

  pushNotification: async (data: {
    title: string;
    message: string;
    type?: 'info' | 'success' | 'warning' | 'reminder';
    action_url?: string;
    user_ids?: number[];
    broadcast?: boolean;
  }): Promise<{ notification_id: number; recipient_count: number }> => {
    const response = await api.post<{ notification_id: number; recipient_count: number }>('/notifications/push', data);
    return response.data;
  },

  createAnnouncement: async (data: AnnouncementUpsertPayload): Promise<Announcement> => {

    const response = await api.post<Announcement>('/announcements/', data);
    return { ...response.data, id: String(response.data.id) };
  },

  updateAnnouncement: async (id: number, data: AnnouncementUpsertPayload): Promise<Announcement> => {

    const response = await api.put<Announcement>(`/announcements/${id}`, data);
    return { ...response.data, id: String(response.data.id) };
  },

  deleteAnnouncement: async (id: number): Promise<void> => {

    await api.delete(`/announcements/${id}`);
  },

  // Admin - Employees
  createEmployee: async (data: Partial<Employee>): Promise<Employee> => {

    const response = await api.post('/employees/', data);
    return response.data;
  },

  updateEmployee: async (id: number, data: Partial<Employee>): Promise<Employee> => {

    const response = await api.put(`/employees/${id}`, data);
    return response.data;
  },

  deleteEmployee: async (id: number): Promise<void> => {

    await api.delete(`/employees/${id}`);
  },

  // Admin - News
  createNews: async (data: Partial<NewsItem>): Promise<NewsItem> => {

    const response = await api.post('/news/', data);
    return response.data;
  },

  updateNews: async (id: number, data: Partial<NewsItem>): Promise<NewsItem> => {

    const response = await api.put(`/news/${id}`, data);
    return response.data;
  },

  deleteNews: async (id: number): Promise<void> => {

    await api.delete(`/news/${id}`);
  },

  optimizeStorage: async () => {

    const response = await api.post('/admin/system/optimize-storage', {});
    return response.data;
  },

  chatAI: async (prompt: string, modelId?: number, imageUrl?: string): Promise<string> => {
    const response = await api.post<{ response: string }>('/ai/chat', { prompt, model_id: modelId, image_url: imageUrl });
    return response.data.response;
  },



  getAIModels: async (): Promise<AIModelOption[]> => {
    const isAdminScope = getRuntimeScopePrefix() === '/admin';
    if (isAdminScope) {
      const response = await api.get<AIProvider[]>('/ai/admin/providers');
      return response.data
        .filter((provider) => provider.is_active)
        .map((provider) => ({
          id: provider.id,
          name: provider.name,
          model: provider.model,
          type: provider.type,
          model_kind: provider.model_kind || 'text',
        }));
    }
    const response = await api.get<AIModelOption[]>('/ai/models');
    return response.data;
  },

  // Admin - Users
  getUsers: async (): Promise<User[]> => {
    const response = await api.get<User[]>('/iam/admin/users');
    return response.data;
  },

  getUserOptions: async (): Promise<UserOption[]> => {
    const response = await api.get('/iam/admin/users/options');
    return response.data;
  },

  createUser: async (data: UserCreatePayload): Promise<User> => {
    const response = await api.post<User>('/iam/admin/users', data);
    return response.data;
  },

  updateUser: async (id: number, data: UserUpdatePayload): Promise<User> => {
    const response = await api.put<User>(`/iam/admin/users/${id}`, data);
    return response.data;
  },

  deleteUser: async (id: number): Promise<void> => {

    await api.delete(`/iam/admin/users/${id}`);
  },

  resetPassword: async (username: string): Promise<ResetPasswordResponse> => {
    const response = await api.post<ResetPasswordResponse>('/iam/admin/users/reset-password', { username });
    return response.data;
  },

  changeMyPassword: async (data: ChangePasswordPayload): Promise<ApiMessageResponse> => {
    const audience = getRuntimeScopePrefix() === '/admin' ? 'admin' : 'portal';
    const response = await api.put<ApiMessageResponse>('/iam/users/me/password', data, {
      params: { audience },
    });
    return response.data;
  },

  grantPortalAdmin: async (id: number): Promise<ApiMessageResponse> => {
    const response = await api.post<ApiMessageResponse>(`/iam/admin/users/${id}/portal-admin/grant`);
    return response.data;
  },

  revokePortalAdmin: async (id: number): Promise<ApiMessageResponse> => {
    const response = await api.post<ApiMessageResponse>(`/iam/admin/users/${id}/portal-admin/revoke`);
    return response.data;
  },

  getOnlineUsers: async (params?: {
    audience_scope?: 'admin' | 'portal' | 'all';
    keyword?: string;
  }): Promise<OnlineUserSession[]> => {
    const response = await api.get<OnlineUserSession[]>('/iam/auth/sessions/online', { params });
    return Array.isArray(response.data) ? response.data : [];
  },

  kickUserSessions: async (
    userId: number,
    audience_scope: 'admin' | 'portal' | 'all' = 'all'
  ): Promise<SessionRevokeResult> => {
    const response = await api.post<SessionRevokeResult>(`/iam/auth/sessions/${userId}/kick`, {
      audience_scope,
    });
    return response.data;
  },

  getRoles: async (): Promise<Role[]> => {
    const response = await api.get<Role[]>('/iam/admin/roles');
    return response.data;
  },

  createRole: async (data: RoleCreate): Promise<Role> => {
    const response = await api.post<Role>('/iam/admin/roles', data);
    return response.data;
  },

  updateRole: async (id: number, data: RoleUpdate): Promise<Role> => {
    const response = await api.put<Role>(`/iam/admin/roles/${id}`, data);
    return response.data;
  },

  deleteRole: async (id: number): Promise<void> => {

    await api.delete(`/iam/admin/roles/${id}`);
  },

  getPermissions: async (): Promise<Permission[]> => {
    const response = await api.get<Permission[]>('/iam/admin/permissions');
    return response.data;
  },

  getDepartments: async (): Promise<Department[]> => {
    const response = await api.get<Department[]>('/departments/');
    return response.data;
  },

  createDepartment: async (data: DepartmentCreatePayload): Promise<Department> => {
    const response = await api.post<Department>('/departments/', data);
    return response.data;
  },

  updateDepartment: async (id: number, data: DepartmentUpdatePayload): Promise<Department> => {
    const response = await api.put<Department>(`/departments/${id}`, data);
    return response.data;
  },

  deleteDepartment: async (id: number): Promise<void> => {

    await api.delete(`/departments/${id}`);
  },

  getSystemConfig: async (): Promise<Record<string, string>> => {
    const response = await api.get('/admin/system/config');
    return response.data;
  },

  getCustomizationConfig: async (): Promise<Record<string, string>> => {
    const response = await api.get('/admin/system/config', {
      params: { scope: 'customization' },
    });
    return response.data;
  },

  getMfaSettingsConfig: async (): Promise<Record<string, string>> => {
    const response = await api.get('/admin/system/config', {
      params: { scope: 'mfa' },
    });
    return response.data;
  },

  getPlatformConfig: async (): Promise<Record<string, string>> => {
    const response = await api.get('/admin/system/config', {
      params: { scope: 'platform' },
    });
    return response.data;
  },

  getPublicSystemConfig: async (): Promise<Record<string, string>> => {
    const response = await api.get('/public/config');
    return response.data;
  },

  sessionPing: async (audience: 'admin' | 'portal'): Promise<{
    message: string;
    audience: 'admin' | 'portal';
    refreshed: boolean;
    expires_at_epoch: number;
    expires_in_seconds: number;
    absolute_timeout_minutes: number;
  }> => {
    const response = await api.post('/system/session/ping', null, {
      params: { audience },
    });
    return response.data;
  },

  updateSystemConfig: async (config: Record<string, string>): Promise<Record<string, string>> => {

    const response = await api.post('/admin/system/config', config);
    return response.data;
  },

  updateCustomizationConfig: async (config: Record<string, string>): Promise<Record<string, string>> => {
    const response = await api.post('/admin/system/config', config, {
      params: { scope: 'customization' },
    });
    return response.data;
  },

  updateMfaSettingsConfig: async (config: Record<string, string>): Promise<Record<string, string>> => {
    const response = await api.post('/admin/system/config', config, {
      params: { scope: 'mfa' },
    });
    return response.data;
  },

  getPlatformRuntimeStatus: async (): Promise<Record<string, string>> => {
    const response = await api.get('/admin/system/platform/runtime');
    return response.data;
  },

  applyPlatformSettings: async (): Promise<{
    status: string;
    message: string;
    applied_at?: string;
    hook_status?: string;
    reload_required?: boolean;
  }> => {
    const response = await api.post('/admin/system/platform/apply', {});
    return response.data;
  },

  testPlatformNtpConnectivity: async (payload: {
    platform_ntp_server: string;
    platform_ntp_port: number;
  }): Promise<{
    status: string;
    message: string;
    server: string;
    port: number;
    latency_ms: number;
    stratum: number;
  }> => {
    const response = await api.post('/admin/system/platform/ntp/test', payload);
    return response.data;
  },

  getSystemInfo: async (): Promise<SystemInfo> => {
    const response = await api.get<SystemInfo>('/admin/system/info');
    return response.data;
  },

  getSystemVersion: async (): Promise<SystemVersion> => {
    const response = await api.get<SystemVersion>('/admin/system/version');
    return response.data;
  },

  installLicense: async (license: { payload: Record<string, unknown>; signature: string }): Promise<LicenseStatus> => {
    const response = await api.post<LicenseStatus>('/admin/system/license/install/', license);
    return response.data;
  },

  installLicenseRevocations: async (
    revocation: { payload: Record<string, unknown> },
  ): Promise<LicenseRevocationInstallResponse> => {
    const response = await api.post<LicenseRevocationInstallResponse>(
      '/admin/system/license/revocations/install/',
      revocation,
    );
    return response.data;
  },

  getLicenseStatus: async (): Promise<LicenseStatus> => {
    const response = await api.get<LicenseStatus>('/admin/system/license/status/');
    return response.data;
  },

  getLicenseClaims: async (): Promise<LicenseClaimsResponse> => {
    const response = await api.get<LicenseClaimsResponse>('/admin/system/license/claims/');
    return response.data;
  },

  getLicenseEvents: async (limit = 20, offset = 0, importOnly = true): Promise<LicenseEventListResponse> => {
    const response = await api.get<LicenseEventListResponse>('/admin/system/license/events/', {
      params: { limit, offset, import_only: importOnly },
    });
    return response.data;
  },

  // Log Management
  getSystemLogs: async (params?: { level?: string; limit?: number; offset?: number }): Promise<SystemLog[]> => {
    const response = await api.get<SystemLog[]>('/logs/system', { params });
    return response.data;
  },

  getBusinessLogs: async (params?: { operator?: string; action?: string; source?: string; limit?: number; offset?: number }): Promise<BusinessLog[]> => {
    const response = await api.get<BusinessLog[]>('/logs/business', { params });
    return response.data;
  },

  getAccessLogs: async (params?: { path?: string; status_code?: number; limit?: number }): Promise<AccessLogEntry[]> => {
    const response = await api.get<AccessLogEntry[]>('/logs/access', { params });
    return response.data;
  },

  logBusinessAction: async (log: { action: string; target?: string; detail?: string; status?: string }): Promise<AxiosResponse<ApiMessageResponse> | null> => {
    try {
      return api.post('/logs/business', {
        action: log.action,
        target: log.target || '',
        status: log.status || 'SUCCESS',
        detail: log.detail || ''
      });
    } catch (e) {
      console.warn("Failed to log action:", e);
      return null;
    }
  },




  getLogForwardingConfig: async (): Promise<LogForwardingConfig[]> => {

    const response = await api.get<LogForwardingConfig[]>('/logs/config');
    return response.data;
  },

  saveLogForwardingConfig: async (data: LogForwardingUpsertPayload): Promise<LogForwardingConfig> => {

    const response = await api.post<LogForwardingConfig>('/logs/config', data);
    return response.data;
  },

  deleteLogForwardingConfig: async (id: number): Promise<void> => {

    await api.delete(`/logs/config/${id}`);
  },

  // Carousel
  getCarouselItems: async (): Promise<CarouselItem[]> => {
    const response = await api.get('/carousel/');
    return response.data;
  },

  getAdminCarouselItems: async (): Promise<CarouselItem[]> => {

    const response = await api.get('/carousel/admin');
    return response.data;
  },

  createCarouselItem: async (data: Partial<CarouselItem>): Promise<CarouselItem> => {

    const response = await api.post('/carousel/', data);
    return response.data;
  },

  updateCarouselItem: async (id: number, data: Partial<CarouselItem>): Promise<CarouselItem> => {

    const response = await api.put(`/carousel/${id}`, data);
    return response.data;
  },

  deleteCarouselItem: async (id: number): Promise<void> => {

    await api.delete(`/carousel/${id}`);
  },

  // Dashboard
  getDashboardStats: async () => {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },

  // System Resources
  getSystemResources: async () => {

    const response = await api.get('/admin/system/resources');
    return response.data;
  },

  getStorageStats: async (): Promise<import('../types').StorageStats> => {
    const response = await api.get('/admin/system/storage');
    return response.data;
  },

  // AI Management - Uses Cookie-based auth (HttpOnly cookie sent automatically)
  getAIProviders: async (): Promise<AIProvider[]> => {
    const response = await api.get('/ai/admin/providers');
    return response.data;
  },

  createAIProvider: async (data: Partial<AIProvider>): Promise<AIProvider> => {
    const response = await api.post('/ai/admin/providers', data);
    return response.data;
  },

  updateAIProvider: async (id: number, data: Partial<AIProvider>): Promise<AIProvider> => {
    const response = await api.put(`/ai/admin/providers/${id}`, data);
    return response.data;
  },

  deleteAIProvider: async (id: number): Promise<void> => {
    await api.delete(`/ai/admin/providers/${id}`);
  },

  testAIProvider: async (data: Partial<AIProvider>): Promise<AIProviderTestResponse> => {
    const response = await api.post<AIProviderTestResponse>('/ai/admin/providers/test', data);
    return response.data;
  },

  getAIPolicies: async (): Promise<AISecurityPolicy[]> => {
    const response = await api.get('/ai/admin/policies');
    return response.data;
  },

  createAIPolicy: async (data: Partial<AISecurityPolicy>): Promise<AISecurityPolicy> => {
    const response = await api.post('/ai/admin/policies', data);
    return response.data;
  },

  updateAIPolicy: async (id: number, data: Partial<AISecurityPolicy>): Promise<AISecurityPolicy> => {
    const response = await api.put(`/ai/admin/policies/${id}`, data);
    return response.data;
  },

  deleteAIPolicy: async (id: number): Promise<void> => {
    await api.delete(`/ai/admin/policies/${id}`);
  },

  // AI Audit Logs
  getAIAuditLogs: async (params?: AIAuditQueryParams): Promise<AIAuditLogEntry[]> => {
    const response = await api.get<AIAuditLogEntry[]>('/logs/ai-audit', { params });
    return response.data;
  },

  getAIAuditDetail: async (eventId: string): Promise<AIAuditLogEntry> => {
    const response = await api.get<AIAuditLogEntry>(`/logs/ai-audit/${eventId}`);
    return response.data;
  },

  getAIAuditStats: async (days: number = 7): Promise<{
    period_days: number;
    total_requests: number;
    success_count: number;
    blocked_count: number;
    error_count: number;
    success_rate: number;
    avg_latency_ms: number;
    total_tokens_in: number;
    total_tokens_out: number;
    total_tokens: number;
    model_breakdown: Array<{
      model: string;
      requests: number;
      tokens_in: number;
      tokens_out: number;
      total_tokens: number;
    }>;
    daily_trend: Array<{
      date: string;
      tokens_in: number;
      tokens_out: number;
      total_tokens: number;
    }>;
    total_tokens_prev?: number;
    trend_percentage?: number;
  }> => {
    const response = await api.get('/logs/ai-audit/stats/summary', { params: { days } });
    return response.data;
  },

  getAIModelUsage: async (hours?: number): Promise<AIModelUsageItem[]> => {
    const response = await api.get<AIModelUsageItem[]>('/ai/admin/usage', { params: { hours } });
    return response.data;
  },

  updateAIModelQuota: async (data: AIModelQuotaUpdatePayload): Promise<ApiMessageResponse> => {
    const response = await api.post<ApiMessageResponse>('/ai/admin/quotas', data);
    return response.data;
  },

  getIamAuditLogs: async (params: IAMAuditQueryParams): Promise<IAMAuditListResponse> => {
    const response = await api.get<IAMAuditListResponse>('/iam/audit/logs', { params });
    return response.data;
  },

  // Knowledge Base
  getKBDocuments: async (): Promise<KBDocumentSummary[]> => {
    const response = await api.get<KBDocumentSummary[]>('/kb/documents');
    return response.data;
  },

  getKBDocumentDetail: async (id: number): Promise<KBDocumentUpsertPayload> => {
    const response = await api.get<KBDocumentUpsertPayload>(`/kb/documents/${id}`);
    return response.data;
  },

  getKBStats: async (): Promise<KBStatsResponse> => {
    const response = await api.get<KBStatsResponse>('/kb/stats');
    return response.data;
  },

  createKBDocument: async (data: KBDocumentUpsertPayload): Promise<KBDocumentSummary> => {
    const response = await api.post<KBDocumentSummary>('/kb/documents', data);
    return response.data;
  },

  updateKBDocument: async (id: number, data: KBDocumentUpsertPayload): Promise<KBDocumentSummary> => {
    const response = await api.put<KBDocumentSummary>(`/kb/documents/${id}`, data);
    return response.data;
  },

  deleteKBDocument: async (id: number): Promise<void> => {
    await api.delete(`/kb/documents/${id}`);
  },

  reindexKBDocument: async (id: number): Promise<KBReindexResponse> => {
    const response = await api.post<KBReindexResponse>(`/kb/documents/${id}/reindex`);
    return response.data;
  },

  queryKB: async (query: string, topK: number = 5): Promise<KBQueryResponse> => {
    const response = await api.post<KBQueryResponse>('/kb/query', { query, top_k: topK });
    return response.data;
  },

  // MFA Management (public/authenticated endpoints, no scope prefix)
  getMfaStatus: async (audience: 'portal' | 'admin' = 'portal'): Promise<{ totp_enabled: boolean; email_mfa_enabled: boolean; webauthn_enabled: boolean }> => {
    const response = await api.get('/mfa/status', { params: { audience } });
    return response.data;
  },

  setupMfa: async (audience: 'portal' | 'admin' = 'portal'): Promise<{ secret: string; qr_code: string; otpauth_uri: string }> => {
    const response = await api.post('/mfa/setup', {}, { params: { audience } });
    return response.data;
  },

  verifyMfaSetup: async (code: string, audience: 'portal' | 'admin' = 'portal'): Promise<{ message: string }> => {
    const response = await api.post('/mfa/verify-setup', { code }, { params: { audience } });
    return response.data;
  },

  disableMfa: async (
    password: string,
    totp_code: string,
    audience: 'portal' | 'admin' = 'portal',
  ): Promise<{ message: string }> => {
    const response = await api.delete('/mfa/', {
      data: { password, totp_code },
      params: { audience },
    });
    return response.data;
  },

  // Captcha (public endpoint, no scope prefix)
  getCaptcha: async (): Promise<{ captcha_id: string; captcha_image: string }> => {
    const response = await axios.get(`${API_BASE_URL}/captcha/generate`);
    return response.data;
  },

  // Admin: batch reset MFA
  batchResetMfa: async (usernames: string[]): Promise<{ reset_count: number }> => {
    const response = await api.post('/mfa/admin/batch-reset', { usernames });
    return response.data;
  },

  // Email MFA
  getEmailMfaStatus: async (
    audience: 'portal' | 'admin' = 'portal',
  ): Promise<{ email_mfa_enabled: boolean; email: string; email_masked?: string; has_email: boolean }> => {
    const response = await api.get('/mfa/email/status', { params: { audience } });
    return response.data;
  },

  enableEmailMfa: async (audience: 'portal' | 'admin' = 'portal'): Promise<{ message: string }> => {
    const response = await api.post('/mfa/email/enable', {}, { params: { audience } });
    return response.data;
  },

  verifyEnableEmailMfa: async (code: string, audience: 'portal' | 'admin' = 'portal'): Promise<{ message: string }> => {
    const response = await api.post('/mfa/email/verify-enable', { code }, { params: { audience } });
    return response.data;
  },

  disableEmailMfa: async (password: string, audience: 'portal' | 'admin' = 'portal'): Promise<{ message: string }> => {
    const response = await api.delete('/mfa/email', {
      data: { password, totp_code: '' },
      params: { audience },
    });
    return response.data;
  },

  sendEmailMfaCode: async (audience: 'portal' | 'admin' = 'portal', mfaToken?: string): Promise<{ message: string }> => {
    const response = await api.post('/mfa/email/send-code', {}, {
      params: mfaToken ? { audience, mfa_token: mfaToken } : { audience },
    });
    return response.data;
  },

  // WebAuthn (Hardware Security Key)
  getWebAuthnStatus: async (audience: 'portal' | 'admin' = 'portal'): Promise<{ credentials: Array<{ id: number; name: string; created_at: string | null; transports: string[] | null }> }> => {
    const response = await api.get('/mfa/webauthn/status', { params: { audience } });
    return response.data;
  },

  getWebAuthnRegisterOptions: async (audience: 'portal' | 'admin' = 'portal'): Promise<WebAuthnRegisterOptions> => {
    const response = await api.post<WebAuthnRegisterOptions>('/mfa/webauthn/register/options', {}, { params: { audience } });
    return response.data;
  },

  verifyWebAuthnRegister: async (
    credential: WebAuthnRegisterCredentialPayload,
    name: string,
    audience: 'portal' | 'admin' = 'portal',
  ): Promise<WebAuthnRegisterVerifyResponse> => {
    const response = await api.post<WebAuthnRegisterVerifyResponse>('/mfa/webauthn/register/verify', { credential, name }, { params: { audience } });
    return response.data;
  },

  getWebAuthnAuthOptions: async (
    mfaToken?: string,
    audience: 'portal' | 'admin' = 'portal',
  ): Promise<WebAuthnAuthOptions> => {
    const params = mfaToken ? { mfa_token: mfaToken, audience } : { audience };
    const response = await api.post<WebAuthnAuthOptions>('/mfa/webauthn/authenticate/options', {}, { params });
    return response.data;
  },

  deleteWebAuthnCredential: async (
    credentialId: number,
    password: string,
    audience: 'portal' | 'admin' = 'portal',
  ): Promise<{ message: string }> => {
    const response = await api.delete(`/mfa/webauthn/${credentialId}`, {
      data: { password },
      params: { audience },
    });
    return response.data;
  },

  // SMTP Test
  testSmtp: async (toEmail: string): Promise<{ message: string }> => {
    const response = await api.post('/admin/system/smtp/test', { to_email: toEmail });
    return response.data;
  },

  // Telegram Bot Test
  testTelegramBot: async (payload: {
    bot_token?: string;
    chat_id?: string;
    message?: string;
    parse_mode?: string;
    disable_web_page_preview?: boolean;
  }): Promise<{ message: string }> => {
    const response = await api.post('/admin/system/telegram/test', payload);
    return response.data;
  },

  // SMS Gateway Test
  testSms: async (payload: {
    provider?: string;
    test_phone?: string;
    test_message?: string;
    sms_sign_name?: string;
    sms_template_code?: string;
    sms_template_param?: string;
    sms_access_key_id?: string;
    sms_access_key_secret?: string;
    sms_region_id?: string;
    tencent_secret_id?: string;
    tencent_secret_key?: string;
    tencent_sdk_app_id?: string;
    tencent_sign_name?: string;
    tencent_template_id?: string;
    tencent_template_params?: string;
    tencent_region?: string;
    twilio_account_sid?: string;
    twilio_auth_token?: string;
    twilio_from_number?: string;
    twilio_messaging_service_sid?: string;
  }): Promise<{ message: string }> => {
    const response = await api.post('/admin/system/sms/test', payload);
    return response.data;
  },

  // Notification Services Health
  getNotificationHealth: async (): Promise<{
    overall_status: 'healthy' | 'degraded' | 'disabled' | string;
    channels: {
      smtp: { enabled: boolean; configured: boolean; status: string; sender?: string };
      telegram: { enabled: boolean; configured: boolean; status: string };
      sms: { enabled: boolean; configured: boolean; status: string; provider?: string };
    };
  }> => {
    const response = await api.get('/admin/system/notification/health');
    return response.data;
  },
};

export default ApiClient;
