import { useCallback, useEffect, useState } from 'react';
import { useAdminNavigationState } from '@/modules/admin/hooks/useAdminNavigationState';
import type { AdminTabKey } from '@/modules/admin/types/tabKeys';
import { getPreferredAuthPlane, setPreferredAuthPlane, type AuthPlane } from '@/shared/utils/authPlane';

interface UseAppModeStateResult {
  preferredAuthPlane: AuthPlane;
  isAdminMode: boolean;
  isAdminPath: boolean;
  activeAdminTab: AdminTabKey;
  setActiveAdminTab: (tab: AdminTabKey) => void;
  syncAdminTabPath: (tab: string) => AdminTabKey;
  openAdminHome: () => void;
  enterAdminMode: () => void;
  enableAdminMode: () => void;
  exitAdminMode: () => void;
  forceAdminLicenseTab: () => void;
  handlePortalLoginSuccess: () => void;
  handleAdminLoginSuccess: () => void;
  handleAdminReloginSuccess: () => void;
}

export const useAppModeState = (): UseAppModeStateResult => {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const { activeAdminTab, setActiveAdminTab, syncAdminTabPath, openAdminHome } = useAdminNavigationState();
  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  const preferredAuthPlane = getPreferredAuthPlane();

  useEffect(() => {
    if (!isAdminPath || preferredAuthPlane !== 'admin') {
      setIsAdminMode(false);
    }
  }, [isAdminPath, preferredAuthPlane]);

  const enterAdminMode = useCallback(() => {
    setPreferredAuthPlane('admin');
    setIsAdminMode(true);
    openAdminHome();
  }, [openAdminHome]);

  const enableAdminMode = useCallback(() => {
    setPreferredAuthPlane('admin');
    setIsAdminMode(true);
  }, []);

  const exitAdminMode = useCallback(() => {
    setPreferredAuthPlane('portal');
    setIsAdminMode(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const forceAdminLicenseTab = useCallback(() => {
    setActiveAdminTab('license');
  }, [setActiveAdminTab]);

  const handlePortalLoginSuccess = useCallback(() => {
    setPreferredAuthPlane('portal');
    setIsAdminMode(false);
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleAdminLoginSuccess = useCallback(() => {
    setPreferredAuthPlane('admin');
    setIsAdminMode(true);
    openAdminHome();
  }, [openAdminHome]);

  const handleAdminReloginSuccess = useCallback(() => {
    setPreferredAuthPlane('admin');
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  return {
    preferredAuthPlane,
    isAdminMode,
    isAdminPath,
    activeAdminTab,
    setActiveAdminTab,
    syncAdminTabPath,
    openAdminHome,
    enterAdminMode,
    enableAdminMode,
    exitAdminMode,
    forceAdminLicenseTab,
    handlePortalLoginSuccess,
    handleAdminLoginSuccess,
    handleAdminReloginSuccess,
  };
};
