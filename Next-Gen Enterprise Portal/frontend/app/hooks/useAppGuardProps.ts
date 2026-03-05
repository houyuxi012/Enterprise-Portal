import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { AppRouteGuardsProps } from '@/router/AppRouteGuards';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface UseAppGuardPropsOptions {
  isLoading: boolean;
  isInitialized: boolean;
  isAuthenticated: boolean;
  isAdminMode: boolean;
  isAdminPath: boolean;
  portalLicenseBlocked: boolean;
  portalLicenseBlockedMessage: string;
  t: TranslateFn;
  handleAdminLoginSuccess: () => void;
  handleAdminReloginSuccess: () => void;
  renderAdmin: () => ReactNode;
  renderPortal: () => ReactNode;
}

const NOOP = () => {};

export const useAppGuardProps = ({
  isLoading,
  isInitialized,
  isAuthenticated,
  isAdminMode,
  isAdminPath,
  portalLicenseBlocked,
  portalLicenseBlockedMessage,
  t,
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
      portalLicenseBlocked,
      portalLicenseBlockedMessage,
      t,
      onAdminLoginSuccess: handleAdminLoginSuccess,
      onPortalLoginSuccess: NOOP,
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
      portalLicenseBlocked,
      portalLicenseBlockedMessage,
      t,
      handleAdminLoginSuccess,
      handleAdminReloginSuccess,
      renderAdmin,
      renderPortal,
    ],
  );
