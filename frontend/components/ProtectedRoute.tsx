import React, { useEffect } from 'react';
import { Spin } from 'antd';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    requireAdmin?: boolean;
}

/**
 * ProtectedRoute wrapper that:
 * 1. Triggers initAuth() on mount (calls /users/me)
 * 2. Shows loading spinner while checking
 * 3. Renders fallback (login) if not authenticated
 * 4. Renders children if authenticated
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    children,
    fallback,
    requireAdmin = false
}) => {
    const { isAuthenticated, isLoading, isInitialized, user, initAuth } = useAuth();

    // Trigger auth check on mount
    useEffect(() => {
        initAuth();
    }, [initAuth]);

    // Show loading while initializing
    if (!isInitialized || isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <Spin size="large" />
            </div>
        );
    }

    // Not authenticated - show fallback (login page)
    if (!isAuthenticated) {
        return <>{fallback}</>;
    }

    // Check admin requirement
    if (requireAdmin && user?.role !== 'admin') {
        return <>{fallback}</>;
    }

    // Authenticated - render children
    return <>{children}</>;
};

export default ProtectedRoute;
