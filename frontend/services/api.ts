import axios from 'axios';
import { Employee, NewsItem, QuickTool, Announcement } from '../types';

const API_BASE_URL = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
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
}

export const ApiClient = {
  getEmployees: async (): Promise<Employee[]> => {
    const response = await api.get<Employee[]>('/employees/');
    // Backend returns numeric ID, types use string. We might need casting or refactoring types. 
    // Assuming backend returns proper JSON which JS treats flexibly, but TS might complain.
    return response.data.map(e => ({ ...e, id: String(e.id) })) as unknown as Employee[];
  },

  getNews: async (): Promise<NewsItem[]> => {
    const response = await api.get<NewsItem[]>('/news/');
    return response.data.map(n => ({ ...n, id: String(n.id) }));
  },

  getTools: async (): Promise<QuickToolDTO[]> => {
    const response = await api.get<QuickToolDTO[]>('/tools/');
    return response.data;
  },

  createTool: async (data: any): Promise<QuickToolDTO> => {
    const token = localStorage.getItem('token');
    const response = await api.post('/tools/', data, { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  },

  updateTool: async (id: number, data: any): Promise<QuickToolDTO> => {
    const token = localStorage.getItem('token');
    const response = await api.put(`/tools/${id}`, data, { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  },

  deleteTool: async (id: number): Promise<void> => {
    const token = localStorage.getItem('token');
    await api.delete(`/tools/${id}`, { headers: { Authorization: `Bearer ${token}` } });
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
    return response.data.map(a => ({ ...a, id: String(a.id) }));
  },

  createAnnouncement: async (data: any): Promise<Announcement> => {
    const token = localStorage.getItem('token');
    const response = await api.post('/announcements/', data, { headers: { Authorization: `Bearer ${token}` } });
    return { ...response.data, id: String(response.data.id) };
  },

  updateAnnouncement: async (id: number, data: any): Promise<Announcement> => {
    const token = localStorage.getItem('token');
    const response = await api.put(`/announcements/${id}`, data, { headers: { Authorization: `Bearer ${token}` } });
    return { ...response.data, id: String(response.data.id) };
  },

  deleteAnnouncement: async (id: number): Promise<void> => {
    const token = localStorage.getItem('token');
    await api.delete(`/announcements/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  },

  // Admin - Employees
  createEmployee: async (data: Partial<Employee>): Promise<Employee> => {
    const token = localStorage.getItem('token');
    const response = await api.post('/employees/', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  updateEmployee: async (id: number, data: Partial<Employee>): Promise<Employee> => {
    const token = localStorage.getItem('token');
    const response = await api.put(`/employees/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  deleteEmployee: async (id: number): Promise<void> => {
    const token = localStorage.getItem('token');
    await api.delete(`/employees/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  // Admin - News
  createNews: async (data: Partial<NewsItem>): Promise<NewsItem> => {
    const token = localStorage.getItem('token');
    const response = await api.post('/news/', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  updateNews: async (id: number, data: Partial<NewsItem>): Promise<NewsItem> => {
    const token = localStorage.getItem('token');
    const response = await api.put(`/news/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  deleteNews: async (id: number): Promise<void> => {
    const token = localStorage.getItem('token');
    await api.delete(`/news/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  chatAI: async (prompt: string): Promise<string> => {
    const response = await api.post<{ response: string }>('/ai/chat', { prompt });
    return response.data.response;
  },

  // Admin - Users
  getUsers: async (): Promise<any[]> => {
    const token = localStorage.getItem('token');
    const response = await api.get('/users/', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  createUser: async (data: any): Promise<any> => {
    const token = localStorage.getItem('token');
    const response = await api.post('/users/', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  updateUser: async (id: number, data: any): Promise<any> => {
    const token = localStorage.getItem('token');
    const response = await api.put(`/users/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  deleteUser: async (id: number): Promise<void> => {
    const token = localStorage.getItem('token');
    await api.delete(`/users/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  resetPassword: async (username: string): Promise<void> => {
    const token = localStorage.getItem('token');
    await api.post('/users/reset-password', { username }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  getRoles: async (): Promise<any[]> => {
    const token = localStorage.getItem('token');
    const response = await api.get('/roles/', { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  },

  createRole: async (data: any): Promise<any> => {
    const token = localStorage.getItem('token');
    const response = await api.post('/roles/', data, { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  },

  updateRole: async (id: number, data: any): Promise<any> => {
    const token = localStorage.getItem('token');
    const response = await api.put(`/roles/${id}`, data, { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  },

  deleteRole: async (id: number): Promise<void> => {
    const token = localStorage.getItem('token');
    await api.delete(`/roles/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  },

  getPermissions: async (): Promise<any[]> => {
    const token = localStorage.getItem('token');
    const response = await api.get('/roles/permissions', { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  },

  getDepartments: async (): Promise<any[]> => {
    const token = localStorage.getItem('token');
    const response = await api.get('/departments/', { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  },

  createDepartment: async (data: any): Promise<any> => {
    const token = localStorage.getItem('token');
    const response = await api.post('/departments/', data, { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  },

  updateDepartment: async (id: number, data: any): Promise<any> => {
    const token = localStorage.getItem('token');
    const response = await api.put(`/departments/${id}`, data, { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  },

  deleteDepartment: async (id: number): Promise<void> => {
    const token = localStorage.getItem('token');
    await api.delete(`/departments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  },

  getSystemConfig: async (): Promise<Record<string, string>> => {
    const response = await api.get('/system/config');
    return response.data;
  },

  updateSystemConfig: async (config: Record<string, string>): Promise<Record<string, string>> => {
    const token = localStorage.getItem('token');
    const response = await api.post('/system/config', config, { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  }
};

export default ApiClient;
