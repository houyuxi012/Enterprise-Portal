import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { App } from 'antd';
import AuthService, { User } from '../services/auth';
import {
    AUTH_SESSION_INVALID_EVENT,
    AuthSessionInvalidDetail,
    resolveAuthErrorInfo,
    triggerSessionInvalid
} from '../services/sessionGuard';
import ApiClient from '../services/api';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    isInitialized: boolean;
    login: (username: string, password: string, type?: 'portal' | 'admin', headers?: Record<string, string>) => Promise<User>;
    logout: () => void;
    initAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const { message } = App.useApp();
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true); // Start as loading to prevent flash of login
    const [isInitialized, setIsInitialized] = useState(false);
    const initPromiseRef = useRef<Promise<void> | null>(null);

    // Computed property
    const isAuthenticated = user !== null;

    // Login method - called by Login page after form submit
    const login = useCallback(async (username: string, password: string, type: 'portal' | 'admin' = 'portal', headers?: Record<string, string>): Promise<User> => {
        setIsLoading(true);
        try {
            const loggedInUser = await AuthService.login(username, password, type, headers);
            setUser(loggedInUser);
            setIsInitialized(true);
            return loggedInUser;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Logout method
    const logout = useCallback(() => {
        AuthService.logout();
        setUser(null);
        setIsInitialized(false);
    }, []);

    // Init auth - called by ProtectedRoute on mount
    // Uses single-flight pattern to prevent duplicate /iam/auth/me calls
    const initAuth = useCallback(async (): Promise<void> => {
        // If already initialized, skip
        if (isInitialized) {
            return;
        }

        // If init is already in progress, return the existing promise
        if (initPromiseRef.current) {
            return initPromiseRef.current;
        }

        // Start new init
        setIsLoading(true);
        initPromiseRef.current = (async () => {
            try {
                const currentUser = await AuthService.getCurrentUser();
                setUser(currentUser);
                setIsInitialized(true);
            } catch (error) {
                // Not authenticated - this is expected for unauthenticated users
                setUser(null);
                setIsInitialized(true);
            } finally {
                setIsLoading(false);
                initPromiseRef.current = null;
            }
        })();

        return initPromiseRef.current;
    }, [isInitialized]);

    // Auto-initialize auth on mount (handles page refresh)
    useEffect(() => {
        initAuth();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const onSessionInvalid = (event: Event) => {
            const detail = (event as CustomEvent<AuthSessionInvalidDetail>).detail;
            setUser(null);
            setIsLoading(false);
            setIsInitialized(true);
            initPromiseRef.current = null;

            const msg = detail?.message || '登录状态已失效，请重新登录。';
            message.warning(msg);

            const redirectTo = detail?.redirectTo
                || (window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login');
            if (window.location.pathname !== redirectTo) {
                window.history.replaceState({}, '', redirectTo);
            }
        };

        window.addEventListener(AUTH_SESSION_INVALID_EVENT, onSessionInvalid);
        return () => {
            window.removeEventListener(AUTH_SESSION_INVALID_EVENT, onSessionInvalid);
        };
    }, [message]);

    useEffect(() => {
        if (!isAuthenticated) return;

        let canceled = false;
        let pingInFlight = false;
        let lastActivityAt = Date.now();
        let lastPingAt = Date.now();
        const HEARTBEAT_INTERVAL_MS = 180 * 1000;
        const ACTIVE_WINDOW_MS = 180 * 1000;
        const CHECK_INTERVAL_MS = 15 * 1000;

        const resolveAudience = (): 'portal' | 'admin' =>
            window.location.pathname.startsWith('/admin') ? 'admin' : 'portal';

        const heartbeat = async () => {
            if (pingInFlight || canceled) return;
            pingInFlight = true;
            try {
                await ApiClient.sessionPing(resolveAudience());
                lastPingAt = Date.now();
            } catch (error) {
                if (!canceled) {
                    const handled = triggerSessionInvalid(error, { source: 'heartbeat' });
                    if (!handled) {
                        const { status, code } = resolveAuthErrorInfo(error);
                        console.warn('Session heartbeat failed (non-auth error):', { status, code });
                    }
                }
            } finally {
                pingInFlight = false;
            }
        };

        const onActivity = () => {
            lastActivityAt = Date.now();
        };

        const activityEvents: Array<keyof WindowEventMap> = [
            'mousemove',
            'keydown',
            'click',
            'scroll',
            'touchstart',
        ];
        activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, onActivity, { passive: true });
        });

        const timer = window.setInterval(() => {
            const now = Date.now();
            const activeRecently = (now - lastActivityAt) <= ACTIVE_WINDOW_MS;
            const heartbeatDue = (now - lastPingAt) >= HEARTBEAT_INTERVAL_MS;
            if (activeRecently && heartbeatDue) {
                void heartbeat();
            }
        }, CHECK_INTERVAL_MS);

        return () => {
            canceled = true;
            window.clearInterval(timer);
            activityEvents.forEach((eventName) => {
                window.removeEventListener(eventName, onActivity);
            });
        };
    }, [isAuthenticated, user?.id]);

    const value: AuthContextType = {
        user,
        isLoading,
        isAuthenticated,
        isInitialized,
        login,
        logout,
        initAuth,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
