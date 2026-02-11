import axios from 'axios';


const API_URL = import.meta.env.VITE_API_BASE_URL || '';

export interface User {
    id: number;
    username: string;
    email: string;
    role?: string;
    account_type?: 'PORTAL' | 'SYSTEM';
    roles?: { code: string; name?: string; app_id?: string }[];
    permissions?: string[];
    name?: string;
    avatar?: string;
}

interface AuthResponse {
    access_token: string;
    token_type: string;
}

class AuthService {
    async login(username: string, password: string, type: 'portal' | 'admin' = 'portal'): Promise<User> {
        // Phase 2: Remove RSA, send plain password (protected by HTTPS)
        // Phase 1: Cookie Auth (No token storage in localStorage)

        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);

        const endpoint = type === 'admin' ? '/iam/auth/admin/token' : '/iam/auth/portal/token';

        // API_URL is expected to be the API base (e.g. '/api' or full origin + '/api').
        // The server now only supports dual-session login endpoints:
        // /iam/auth/portal/token and /iam/auth/admin/token.

        await axios.post<AuthResponse>(`${API_URL}${endpoint}`, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            withCredentials: true
        });

        // If we get here, login was successful - cookie is set by backend
        return this.getCurrentUser(type);
    }

    async logout(redirectUrl: string = '/') {
        try {
            await axios.post(`${API_URL}/iam/auth/logout`, {}, { withCredentials: true });
        } catch (e) {
            console.error("Logout failed", e);
        }
        window.location.href = redirectUrl;
    }

    async getCurrentUser(type?: 'portal' | 'admin'): Promise<User> {
        // No header injection needed, browser sends HttpOnly cookie automatically
        const runtimeType =
            type ||
            (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
                ? 'admin'
                : 'portal');

        const response = await axios.get<User>(`${API_URL}/iam/auth/me`, {
            withCredentials: true,
            params: { audience: runtimeType }
        });
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
