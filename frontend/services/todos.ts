import axios from 'axios';
import { Todo, PaginatedTodoResponse } from '../types';

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
        console.error('API Error:', error);
        return Promise.reject(error);
    }
);

export interface CreateTodoDTO {
    title: string;
    description?: string;
    priority?: number; // 0|1|2|3
    due_at?: string;
    assignee_id?: number; // Only used for Admin
}

export interface UpdateTodoDTO {
    title?: string;
    description?: string;
    priority?: number;
    due_at?: string;
    assignee_id?: number; // Only used for Admin
}

export interface TodoQueryParams {
    page?: number;
    page_size?: number;
    status?: string;
    q?: string;
    priority?: number;
    preset?: 'today' | 'week' | 'urgent';
    sort?: string;
    order?: 'asc' | 'desc';
    assignee_id?: number; // Admin only
}

export interface TodoStats {
    scope: 'active' | 'all';
    total: number;
    emergency: number;
    high: number;
    medium: number;
    low: number;
    unclassified: number;
    pending: number;
    in_progress: number;
    completed: number;
    canceled: number;
}

const TodoService = {
    // --- User API ---
    getMyTasks: async (params: TodoQueryParams = {}): Promise<PaginatedTodoResponse> => {
        const searchParams = new URLSearchParams();
        if (params.page) searchParams.append('page', params.page.toString());
        if (params.page_size) searchParams.append('page_size', params.page_size.toString());
        if (params.status) searchParams.append('status', params.status);
        if (params.q) searchParams.append('q', params.q);
        if (params.priority !== undefined) searchParams.append('priority', params.priority.toString());
        if (params.preset) searchParams.append('preset', params.preset);
        if (params.sort) searchParams.append('sort', params.sort);
        if (params.order) searchParams.append('order', params.order);

        return api.get(`/tasks/?${searchParams.toString()}`);
    },

    getMyTaskStats: async (scope: 'active' | 'all' = 'active'): Promise<TodoStats> => {
        return api.get(`/tasks/stats?scope=${scope}`);
    },

    createTask: async (data: CreateTodoDTO): Promise<Todo> => {
        return api.post('/tasks/', data);
    },

    updateTask: async (id: number, data: UpdateTodoDTO): Promise<Todo> => {
        return api.patch(`/tasks/${id}/`, data);
    },

    // State Actions
    completeTask: async (id: number): Promise<Todo> => {
        return api.post(`/tasks/${id}/complete/`);
    },

    reopenTask: async (id: number): Promise<Todo> => {
        return api.post(`/tasks/${id}/reopen/`);
    },

    cancelTask: async (id: number): Promise<Todo> => {
        return api.post(`/tasks/${id}/cancel/`);
    },

    // --- Admin API ---
    getAllTasks: async (params: TodoQueryParams = {}): Promise<PaginatedTodoResponse> => {
        const searchParams = new URLSearchParams();
        if (params.page) searchParams.append('page', params.page.toString());
        if (params.page_size) searchParams.append('page_size', params.page_size.toString());
        if (params.status) searchParams.append('status', params.status);
        if (params.assignee_id) searchParams.append('assignee_id', params.assignee_id.toString());

        return api.get(`/admin/tasks/?${searchParams.toString()}`);
    },

    adminCreateTask: async (data: CreateTodoDTO): Promise<Todo> => {
        return api.post('/admin/tasks/', data);
    },

    adminUpdateTask: async (id: number, data: UpdateTodoDTO): Promise<Todo> => {
        return api.patch(`/admin/tasks/${id}/`, data);
    },

    adminDeleteTask: async (id: number): Promise<void> => {
        return api.delete(`/admin/tasks/${id}/`);
    }
};

export default TodoService;
