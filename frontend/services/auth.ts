import axios from 'axios';


const API_URL = import.meta.env.VITE_API_BASE_URL || '';

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
        // Phase 2: Remove RSA, send plain password (protected by HTTPS)
        // Phase 1: Cookie Auth (No token storage in localStorage)

        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);

        // Relative path used as per global rule
        const response = await axios.post<AuthResponse>(`${API_URL}/auth/token`, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.status === 200) {
            // Cookie is set by backend automatically
            return this.getCurrentUser();
        }
        throw new Error('Login failed');
    }

    async logout() {
        try {
            await axios.post(`${API_URL}/auth/logout`);
        } catch (e) {
            console.error("Logout failed", e);
        }
        window.location.href = '/login';
    }

    async getCurrentUser(): Promise<User> {
        // No header injection needed, browser sends HttpOnly cookie automatically
        const response = await axios.get<User>(`${API_URL}/users/me`);
        return response.data;
    }

    isAuthenticated() {
        // Since we verify via Cookie on mount, we can't synchronously know.
        // We will rely on App.tsx to check getCurrentUser() on load.
        // Returning false here matches the "no local token" state.
        return false;
    }
}

export default new AuthService();
