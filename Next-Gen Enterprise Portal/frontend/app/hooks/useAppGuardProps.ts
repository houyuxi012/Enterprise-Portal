import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { AppRouteGuardsProps } from '@/router/AppRouteGuards';
import type { AuthPlane } from '@/shared/utils/authPlane';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface UseAppGuardPropsOptions {
  isLoading: boolean;
  isInitialized: boolean;
  isAuthenticated: boolean;
  isAdminMode: boolean;
  isAdminPath: boolean;
  preferredAuthPlane: AuthPlane;
  portalLicenseBlocked: boolean;
  portalLicenseBlockedMessage: string;
  t: TranslateFn;
  handlePortalLoginSuccess: () => void;
  handleAdminLoginSuccess: () => void;
  handleAdminReloginSuccess: () => void;
  renderAdmin: () => ReactNode;
  renderPortal: () => ReactNode;
}

export const useAppGuardProps = ({
  isLoading,
  isInitialized,
  isAuthenticated,
  isAdminMode,
  isAdminPath,
  preferredAuthPlane,
  portalLicenseBlocked,
  portalLicenseBlockedMessage,
  t,
  handlePortalLoginSuccess,
  handleAdminLoginSuccess,
  handleAdminReloginSuccess,
  renderAdmin,
  renderPortal,
}: UseAppGuardPropsOptions): AppRouteGuardsProps =>
  useMemo(
    () => ({
      isLoading,
      isInitialized,
      isAuthenticated,
      isAdminMode,
      isAdminPath,
      preferredAuthPlane,
      portalLicenseBlocked,
      portalLicenseBlockedMessage,
      t,
      onAdminLoginSuccess: handleAdminLoginSuccess,
      onPortalLoginSuccess: handlePortalLoginSuccess,
      onAdminReloginSuccess: handleAdminReloginSuccess,
      renderAdmin,
      renderPortal,
    }),
    [
      isLoading,
      isInitialized,
      isAuthenticated,
      isAdminMode,
      isAdminPath,
      preferredAuthPlane,
      portalLicenseBlocked,
      portalLicenseBlockedMessage,
      t,
      handlePortalLoginSuccess,
      handleAdminLoginSuccess,
      handleAdminReloginSuccess,
      renderAdmin,
      renderPortal,
    ],
  );
