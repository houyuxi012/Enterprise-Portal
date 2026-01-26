import axios from 'axios';
import { Employee, NewsItem, QuickTool, Announcement } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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

  getAnnouncements: async (): Promise<Announcement[]> => {
    const response = await api.get<Announcement[]>('/announcements/');
    return response.data.map(a => ({ ...a, id: String(a.id) }));
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
  }
};

export default ApiClient;
