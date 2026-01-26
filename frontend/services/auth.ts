import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface User {
    id: number;
    username: string;
    email: string;
    role: string;
}

interface AuthResponse {
    access_token: string;
    token_type: string;
}

class AuthService {
    async login(username: string, password: string): Promise<User> {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const response = await axios.post<AuthResponse>(`${API_URL}/auth/token`, formData);
        if (response.data.access_token) {
            localStorage.setItem('token', response.data.access_token);
            return this.getCurrentUser();
        }
        throw new Error('Login failed');
    }

    logout() {
        localStorage.removeItem('token');
        window.location.href = '/login';
    }

    async getCurrentUser(): Promise<User> {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('No token found');

        const response = await axios.get<User>(`${API_URL}/auth/users/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    }

    getToken() {
        return localStorage.getItem('token');
    }

    isAuthenticated() {
        return !!localStorage.getItem('token');
    }
}

export default new AuthService();
