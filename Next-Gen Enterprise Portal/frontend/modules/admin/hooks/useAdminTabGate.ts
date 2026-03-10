import { useCallback, useMemo } from 'react';
import type { LicenseGateMode } from '@/app/hooks/useAppBootstrap';
import type { AdminTabKey } from '../types/tabKeys';

interface UseAdminTabGateOptions {
  activeAdminTab: AdminTabKey;
  adminLicenseGateMode: LicenseGateMode;
  mfaSettingsLicenseBlocked: boolean;
  meetingManagementLicenseBlocked: boolean;
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
  meetingManagementLicenseBlocked,
  setActiveAdminTab,
  syncAdminTabPath,
}: UseAdminTabGateOptions): UseAdminTabGateResult => {
  const effectiveAdminTab = useMemo<AdminTabKey>(() => {
    if (adminLicenseGateMode === 'blocked') return 'license';
    if (activeAdminTab === 'mfa_settings' && mfaSettingsLicenseBlocked) return 'license';
    if ((activeAdminTab === 'meeting_local' || activeAdminTab === 'meeting_sync') && meetingManagementLicenseBlocked) return 'license';
    return activeAdminTab;
  }, [adminLicenseGateMode, activeAdminTab, mfaSettingsLicenseBlocked, meetingManagementLicenseBlocked]);

  const handleAdminTabChange = useCallback((tab: string) => {
    if (adminLicenseGateMode === 'blocked' && tab !== 'license') {
      setActiveAdminTab('license');
      return;
    }
    if (tab === 'mfa_settings' && mfaSettingsLicenseBlocked) {
      setActiveAdminTab('license');
      return;
    }
    if ((tab === 'meeting_local' || tab === 'meeting_sync') && meetingManagementLicenseBlocked) {
      setActiveAdminTab('license');
      return;
    }
    syncAdminTabPath(tab);
  }, [adminLicenseGateMode, mfaSettingsLicenseBlocked, meetingManagementLicenseBlocked, setActiveAdminTab, syncAdminTabPath]);

  return {
    effectiveAdminTab,
    handleAdminTabChange,
  };
};
