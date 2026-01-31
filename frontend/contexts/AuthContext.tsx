import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import AuthService, { User } from '../services/auth';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    isInitialized: boolean;
    login: (username: string, password: string) => Promise<User>;
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
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const initPromiseRef = useRef<Promise<void> | null>(null);

    // Computed property
    const isAuthenticated = user !== null;

    // Login method - called by Login page after form submit
    const login = useCallback(async (username: string, password: string): Promise<User> => {
        setIsLoading(true);
        try {
            const loggedInUser = await AuthService.login(username, password);
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
    // Uses single-flight pattern to prevent duplicate /users/me calls
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
