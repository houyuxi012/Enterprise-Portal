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

  chatAI: async (prompt: string): Promise<string> => {
    const response = await api.post<{ response: string }>('/ai/chat', { prompt });
    return response.data.response;
  }
};

export default ApiClient;
