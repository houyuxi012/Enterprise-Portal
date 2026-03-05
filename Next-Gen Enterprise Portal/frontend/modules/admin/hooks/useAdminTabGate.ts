import { useCallback, useMemo } from 'react';
import type { LicenseGateMode } from '@/app/hooks/useAppBootstrap';
import { AdminTabKey } from './useAdminNavigationState';

interface UseAdminTabGateOptions {
  activeAdminTab: AdminTabKey;
  adminLicenseGateMode: LicenseGateMode;
  mfaSettingsLicenseBlocked: boolean;
  setActiveAdminTab: (tab: AdminTabKey) => void;
  syncAdminTabPath: (tab: string) => AdminTabKey;
}

interface UseAdminTabGateResult {
  effectiveAdminTab: AdminTabKey;
  handleAdminTabChange: (tab: string) => void;
}

export const useAdminTabGate = ({
  activeAdminTab,
  adminLicenseGateMode,
  mfaSettingsLicenseBlocked,
  setActiveAdminTab,
  syncAdminTabPath,
}: UseAdminTabGateOptions): UseAdminTabGateResult => {
  const effectiveAdminTab = useMemo<AdminTabKey>(() => {
    if (adminLicenseGateMode === 'blocked') return 'license';
    if (activeAdminTab === 'mfa_settings' && mfaSettingsLicenseBlocked) return 'license';
    return activeAdminTab;
  }, [adminLicenseGateMode, activeAdminTab, mfaSettingsLicenseBlocked]);

  const handleAdminTabChange = useCallback((tab: string) => {
    if (adminLicenseGateMode === 'blocked' && tab !== 'license') {
      setActiveAdminTab('license');
      return;
    }
    if (tab === 'mfa_settings' && mfaSettingsLicenseBlocked) {
      setActiveAdminTab('license');
      return;
    }
    syncAdminTabPath(tab);
  }, [adminLicenseGateMode, mfaSettingsLicenseBlocked, setActiveAdminTab, syncAdminTabPath]);

  return {
    effectiveAdminTab,
    handleAdminTabChange,
  };
};
