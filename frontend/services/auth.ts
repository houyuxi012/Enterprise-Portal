import axios from 'axios';


const API_URL = import.meta.env.VITE_API_BASE_URL || '';

export interface User {
    id: number;
    username: string;
    email: string;
    role: string;
    name?: string;
    avatar?: string;
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
        await axios.post<AuthResponse>(`${API_URL}/auth/token`, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            withCredentials: true
        });

        // If we get here, login was successful - cookie is set by backend
        return this.getCurrentUser();
    }

    async logout() {
        try {
            await axios.post(`${API_URL}/auth/logout`, {}, { withCredentials: true });
        } catch (e) {
            console.error("Logout failed", e);
        }
        // Redirect to admin login page (backend) instead of frontend
        window.location.href = '/admin/login';
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
