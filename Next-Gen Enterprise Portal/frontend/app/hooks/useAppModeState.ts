import { useCallback, useState } from 'react';
import { useAdminNavigationState } from '@/modules/admin/hooks/useAdminNavigationState';
import type { AdminTabKey } from '@/modules/admin/types/tabKeys';

interface UseAppModeStateResult {
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
  handleAdminLoginSuccess: () => void;
  handleAdminReloginSuccess: () => void;
}

export const useAppModeState = (): UseAppModeStateResult => {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const { activeAdminTab, setActiveAdminTab, syncAdminTabPath, openAdminHome } = useAdminNavigationState();

  const enterAdminMode = useCallback(() => {
    setIsAdminMode(true);
    openAdminHome();
  }, [openAdminHome]);

  const enableAdminMode = useCallback(() => {
    setIsAdminMode(true);
  }, []);

  const exitAdminMode = useCallback(() => {
    setIsAdminMode(false);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
  }, []);

  const forceAdminLicenseTab = useCallback(() => {
    setActiveAdminTab('license');
  }, [setActiveAdminTab]);

  const handleAdminLoginSuccess = useCallback(() => {
    setIsAdminMode(true);
    openAdminHome();
  }, [openAdminHome]);

  const handleAdminReloginSuccess = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  return {
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
    handleAdminLoginSuccess,
    handleAdminReloginSuccess,
  };
};
