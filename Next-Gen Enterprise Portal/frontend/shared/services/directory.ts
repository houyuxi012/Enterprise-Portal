import axios from 'axios';
import { triggerSessionInvalid } from './sessionGuard';
import type {
  ApiErrorDetail,
  DirectoryConfig,
  DirectoryCreatePayload,
  DirectoryDraftTestPayload,
  DirectoryListResponse,
  DirectoryType,
  DirectoryTestPayload,
  DirectoryTestResponse,
  DirectoryUpdatePayload,
} from '@/modules/admin/pages/iam/directories/types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const handled = triggerSessionInvalid(error, { source: 'directory-interceptor' });
    if (!handled) {
      console.error('Directory API error:', error);
    }
    return Promise.reject(error);
  }
);

type ApiErrorLike = {
  message?: string;
  response?: {
    data?: {
      detail?: unknown;
    };
  };
};

type DirectoryListLike = {
  total?: unknown;
  page?: unknown;
  page_size?: unknown;
  total_pages?: unknown;
  items?: unknown;
};

const toPositiveNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

export const getApiErrorDetail = (error: unknown): ApiErrorDetail => {
  const detail = (error as ApiErrorLike)?.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    return detail as ApiErrorDetail;
  }
  if (typeof detail === 'string') {
    return { message: detail };
  }
  return { message: (error as ApiErrorLike)?.message || 'Unknown error' };
};

export const isLdapLicenseRequiredError = (error: unknown): boolean => {
  const detail = getApiErrorDetail(error);
  const code = String(detail.code || '').toUpperCase();
  return code === 'LICENSE_REQUIRED';
};

export interface DirectoryListParams {
  q?: string;
  type?: DirectoryType;
  enabled?: boolean;
  updated_at_from?: string;
  updated_at_to?: string;
  page?: number;
  page_size?: number;
}

const DirectoryService = {
  listDirectories: async (params: DirectoryListParams = {}): Promise<DirectoryListResponse> => {
    const data: unknown = await api.get('/iam/admin/directories/', { params });
    if (Array.isArray(data)) {
      const fallbackPage = toPositiveNumber(params.page, 1);
      const fallbackPageSize = toPositiveNumber(params.page_size, data.length || 10);
      return {
        total: data.length,
        page: fallbackPage,
        page_size: fallbackPageSize,
        total_pages: 1,
        items: data as DirectoryConfig[],
      };
    }
    const payload = (data as DirectoryListLike) || {};
    return {
      total: Math.max(0, Number(payload.total || 0)),
      page: toPositiveNumber(payload.page, toPositiveNumber(params.page, 1)),
      page_size: toPositiveNumber(payload.page_size, toPositiveNumber(params.page_size, 10)),
      total_pages: toPositiveNumber(payload.total_pages, 1),
      items: Array.isArray(payload.items) ? payload.items as DirectoryConfig[] : [],
    };
  },

  getDirectory: async (id: number): Promise<DirectoryConfig> => {
    return api.get(`/iam/admin/directories/${id}`);
  },

  createDirectory: async (payload: DirectoryCreatePayload): Promise<DirectoryConfig> => {
    return api.post('/iam/admin/directories/', payload);
  },

  updateDirectory: async (id: number, payload: DirectoryUpdatePayload): Promise<DirectoryConfig> => {
    return api.put(`/iam/admin/directories/${id}`, payload);
  },

  testDirectory: async (id: number, payload: DirectoryTestPayload = {}): Promise<DirectoryTestResponse> => {
    return api.post(`/iam/admin/directories/${id}/test`, payload);
  },

  testDirectoryDraft: async (payload: DirectoryDraftTestPayload): Promise<DirectoryTestResponse> => {
    return api.post('/iam/admin/directories/test-draft', payload);
  },

  syncDirectory: async (id: number, isIncremental?: boolean): Promise<{
    success: boolean;
    fetched_count: number;
    synced_user_count: number;
    synced_org_count: number;
    synced_group_count: number;
    failed_count: number;
  }> => {
    return api.post(`/iam/admin/directories/${id}/sync`, null, {
      params: { is_incremental: isIncremental === true },
    });
  },

  getDeleteProtection: async (): Promise<{
    delete_grace_days: number;
    delete_whitelist: string;
  }> => {
    return api.get('/iam/admin/directories/delete-protection');
  },

  updateDeleteProtection: async (payload: {
    delete_grace_days: number;
    delete_whitelist: string;
  }): Promise<{
    delete_grace_days: number;
    delete_whitelist: string;
  }> => {
    return api.put('/iam/admin/directories/delete-protection', payload);
  },
};

export default DirectoryService;
