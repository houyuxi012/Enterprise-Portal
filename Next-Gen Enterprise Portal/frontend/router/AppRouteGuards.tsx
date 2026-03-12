import React, { Suspense } from 'react';
import Spin from 'antd/es/spin';
import { moduleRouteRegistry } from '../app/router';
import type { AuthPlane } from '@/shared/utils/authPlane';

const { login: Login } = moduleRouteRegistry.portal;
const { login: AdminLogin } = moduleRouteRegistry.admin;

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export interface AppRouteGuardsProps {
  isLoading: boolean;
  isInitialized: boolean;
  isAuthenticated: boolean;
  isAdminMode: boolean;
  isAdminPath: boolean;
  preferredAuthPlane: AuthPlane;
  portalLicenseBlocked: boolean;
  portalLicenseBlockedMessage: string;
  t: TranslateFn;
  onAdminLoginSuccess: () => void;
  onPortalLoginSuccess: () => void;
  onAdminReloginSuccess: () => void;
  renderAdmin: () => React.ReactNode;
  renderPortal: () => React.ReactNode;
}

const FullScreenLoading: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
    <Spin size="large" />
  </div>
);

const AppRouteGuards: React.FC<AppRouteGuardsProps> = ({
  isLoading,
  isInitialized,
  isAuthenticated,
  isAdminMode,
  isAdminPath,
  preferredAuthPlane,
  portalLicenseBlocked,
  portalLicenseBlockedMessage,
  t,
  onAdminLoginSuccess,
  onPortalLoginSuccess,
  onAdminReloginSuccess,
  renderAdmin,
  renderPortal,
}) => {
  const shouldUseAdminLogin = isAdminPath && preferredAuthPlane === 'admin';

  if (isLoading && !isInitialized) {
    return <FullScreenLoading />;
  }

  if (!isAuthenticated) {
    if (shouldUseAdminLogin) {
      return (
        <Suspense fallback={<FullScreenLoading />}>
          <AdminLogin onLoginSuccess={onAdminLoginSuccess} />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<FullScreenLoading />}>
        <Login onLoginSuccess={onPortalLoginSuccess} />
      </Suspense>
    );
  }

  if (isAdminMode) {
    return (
      <Suspense fallback={<FullScreenLoading />}>
        {renderAdmin()}
      </Suspense>
    );
  }

  if (isAdminPath && shouldUseAdminLogin) {
    return (
      <Suspense fallback={<FullScreenLoading />}>
        <AdminLogin onLoginSuccess={onAdminReloginSuccess} />
      </Suspense>
    );
  }

  if (portalLicenseBlocked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-6">
        <div className="max-w-lg w-full rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-xl p-8 text-center space-y-4">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">{t('appRoot.license.notActivatedTitle')}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-7">
            {portalLicenseBlockedMessage || t('appRoot.license.portalBlockedLong')}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition"
          >
            {t('common.buttons.refresh')}
          </button>
        </div>
      </div>
    );
  }

  return <>{renderPortal()}</>;
};

export default AppRouteGuards;
