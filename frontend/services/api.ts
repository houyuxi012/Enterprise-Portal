import axios from 'axios';
import { Employee, NewsItem, QuickTool, Announcement, CarouselItem, AIProvider, AISecurityPolicy, AIModelOption, SystemInfo, SystemVersion, UserOption } from '../types';

const API_BASE_URL = (import.meta as any).env.VITE_API_BASE_URL || '';

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
  if (normalized.startsWith('/iam/') || normalized.startsWith('/public/')) return normalized;
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
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || '');
    const isExpectedMeProbe = status === 401 && requestUrl.includes('/iam/auth/me');
    if (!isExpectedMeProbe) {
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
  visible_to_departments?: string;
}

export interface ResetPasswordResponse {
  message: string;
  new_password?: string | null;
}

export const ApiClient = {
  getEmployees: async (): Promise<Employee[]> => {
    const response = await api.get<Employee[]>('/employees/?limit=1000');
    // Safety & Debug Check
    if (!Array.isArray(response.data)) {
      console.error("API Error [getEmployees]: Expected array, got:", response.data);
      if ((response.data as any)?.detail) {
        console.error("Auth/Server Error Details:", (response.data as any).detail);
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

  createTool: async (data: any): Promise<QuickToolDTO> => {

    const response = await api.post('/tools/', data);
    return response.data;
  },

  updateTool: async (id: number, data: any): Promise<QuickToolDTO> => {

    const response = await api.put(`/tools/${id}`, data);
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

  createAnnouncement: async (data: any): Promise<Announcement> => {

    const response = await api.post('/announcements/', data);
    return { ...response.data, id: String(response.data.id) };
  },

  updateAnnouncement: async (id: number, data: any): Promise<Announcement> => {

    const response = await api.put(`/announcements/${id}`, data);
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

    const response = await api.post('/system/optimize-storage', {});
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
  getUsers: async (): Promise<any[]> => {
    const response = await api.get('/iam/admin/users');
    return response.data;
  },

  getUserOptions: async (): Promise<UserOption[]> => {
    const response = await api.get('/iam/admin/users/options');
    return response.data;
  },

  createUser: async (data: any): Promise<any> => {

    const response = await api.post('/iam/admin/users', data);
    return response.data;
  },

  updateUser: async (id: number, data: any): Promise<any> => {

    const response = await api.put(`/iam/admin/users/${id}`, data);
    return response.data;
  },

  deleteUser: async (id: number): Promise<void> => {

    await api.delete(`/iam/admin/users/${id}`);
  },

  resetPassword: async (username: string): Promise<ResetPasswordResponse> => {
    const response = await api.post<ResetPasswordResponse>('/iam/admin/users/reset-password', { username });
    return response.data;
  },

  grantPortalAdmin: async (id: number): Promise<any> => {
    const response = await api.post(`/iam/admin/users/${id}/portal-admin/grant`);
    return response.data;
  },

  revokePortalAdmin: async (id: number): Promise<any> => {
    const response = await api.post(`/iam/admin/users/${id}/portal-admin/revoke`);
    return response.data;
  },

  getRoles: async (): Promise<any[]> => {

    const response = await api.get('/iam/admin/roles');
    return response.data;
  },

  createRole: async (data: any): Promise<any> => {

    const response = await api.post('/iam/admin/roles', data);
    return response.data;
  },

  updateRole: async (id: number, data: any): Promise<any> => {

    const response = await api.put(`/iam/admin/roles/${id}`, data);
    return response.data;
  },

  deleteRole: async (id: number): Promise<void> => {

    await api.delete(`/iam/admin/roles/${id}`);
  },

  getPermissions: async (): Promise<any[]> => {

    const response = await api.get('/iam/admin/permissions');
    return response.data;
  },

  getDepartments: async (): Promise<any[]> => {

    const response = await api.get('/departments/');
    return response.data;
  },

  createDepartment: async (data: any): Promise<any> => {

    const response = await api.post('/departments/', data);
    return response.data;
  },

  updateDepartment: async (id: number, data: any): Promise<any> => {

    const response = await api.put(`/departments/${id}`, data);
    return response.data;
  },

  deleteDepartment: async (id: number): Promise<void> => {

    await api.delete(`/departments/${id}`);
  },

  getSystemConfig: async (): Promise<Record<string, string>> => {
    const response = await api.get('/system/config');
    return response.data;
  },

  getPublicSystemConfig: async (): Promise<Record<string, string>> => {
    const response = await api.get('/public/config');
    return response.data;
  },

  updateSystemConfig: async (config: Record<string, string>): Promise<Record<string, string>> => {

    const response = await api.post('/system/config', config);
    return response.data;
  },

  getSystemInfo: async (): Promise<SystemInfo> => {
    const response = await api.get<SystemInfo>('/system/info');
    return response.data;
  },

  getSystemVersion: async (): Promise<SystemVersion> => {
    const response = await api.get<SystemVersion>('/system/version');
    return response.data;
  },

  // Log Management
  getSystemLogs: async (params?: { level?: string; limit?: number; offset?: number }): Promise<any[]> => {
    const response = await api.get('/logs/system', { params });
    return response.data;
  },

  getBusinessLogs: async (params?: { operator?: string; action?: string; source?: string; limit?: number; offset?: number }): Promise<any[]> => {
    const response = await api.get('/logs/business', { params });
    return response.data;
  },

  getAccessLogs: async (params?: { path?: string; status_code?: number; limit?: number }): Promise<any[]> => {
    const response = await api.get('/logs/access', { params });
    return response.data;
  },

  logBusinessAction: async (log: { action: string; target?: string; detail?: string; status?: string }): Promise<any> => {
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




  getLogForwardingConfig: async (): Promise<any[]> => {

    const response = await api.get('/logs/config');
    return response.data;
  },

  saveLogForwardingConfig: async (data: any): Promise<any> => {

    const response = await api.post('/logs/config', data);
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

    const response = await api.get('/system/resources');
    return response.data;
  },

  getStorageStats: async (): Promise<import('../types').StorageStats> => {
    const response = await api.get('/system/storage');
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

  testAIProvider: async (data: Partial<AIProvider>): Promise<any> => {
    const response = await api.post('/ai/admin/providers/test', data);
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
  getAIAuditLogs: async (params?: {
    start_time?: string;
    end_time?: string;
    actor_id?: number;
    provider?: string;
    model?: string;
    status?: string;
    source?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> => {
    const response = await api.get('/logs/ai-audit', { params });
    return response.data;
  },

  getAIAuditDetail: async (eventId: string): Promise<any> => {
    const response = await api.get(`/logs/ai-audit/${eventId}`);
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

  getAIModelUsage: async (hours?: number): Promise<any[]> => {
    const response = await api.get('/ai/admin/usage', { params: { hours } });
    return response.data;
  },

  updateAIModelQuota: async (data: any): Promise<any> => {
    const response = await api.post('/ai/admin/quotas', data);
    return response.data;
  },

  getIamAuditLogs: async (params: any): Promise<any> => {
    const response = await api.get('/iam/audit/logs', { params });
    return response.data;
  },

  // Knowledge Base
  getKBDocuments: async (): Promise<any[]> => {
    const response = await api.get('/kb/documents');
    return response.data;
  },

  getKBDocumentDetail: async (id: number): Promise<any> => {
    const response = await api.get(`/kb/documents/${id}`);
    return response.data;
  },

  getKBStats: async (): Promise<any> => {
    const response = await api.get('/kb/stats');
    return response.data;
  },

  createKBDocument: async (data: any): Promise<any> => {
    const response = await api.post('/kb/documents', data);
    return response.data;
  },

  updateKBDocument: async (id: number, data: any): Promise<any> => {
    const response = await api.put(`/kb/documents/${id}`, data);
    return response.data;
  },

  deleteKBDocument: async (id: number): Promise<void> => {
    await api.delete(`/kb/documents/${id}`);
  },

  reindexKBDocument: async (id: number): Promise<any> => {
    const response = await api.post(`/kb/documents/${id}/reindex`);
    return response.data;
  },

  queryKB: async (query: string, topK: number = 5): Promise<any> => {
    const response = await api.post('/kb/query', { query, top_k: topK });
    return response.data;
  }
};

export default ApiClient;
