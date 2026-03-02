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
} from '../pages/admin/iam/directories/types';

const API_BASE_URL = (import.meta as any).env.VITE_API_BASE_URL || '';

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

export const getApiErrorDetail = (error: any): ApiErrorDetail => {
  const detail = error?.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    return detail as ApiErrorDetail;
  }
  if (typeof detail === 'string') {
    return { message: detail };
  }
  return { message: error?.message || 'Unknown error' };
};

export const isLdapLicenseRequiredError = (error: any): boolean => {
  const detail = getApiErrorDetail(error);
  const code = String(detail.code || '').toUpperCase();
  const reason = String(detail.reason || '').toUpperCase();
  return code === 'LICENSE_REQUIRED' && reason.includes('FEATURE');
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
    const data: any = await api.get('/iam/admin/directories/', { params });
    if (Array.isArray(data)) {
      return {
        total: data.length,
        page: Number(params.page || 1),
        page_size: Number(params.page_size || data.length || 10),
        total_pages: 1,
        items: data as DirectoryConfig[],
      };
    }
    return {
      total: Number(data?.total || 0),
      page: Number(data?.page || params.page || 1),
      page_size: Number(data?.page_size || params.page_size || 10),
      total_pages: Number(data?.total_pages || 1),
      items: Array.isArray(data?.items) ? data.items : [],
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
