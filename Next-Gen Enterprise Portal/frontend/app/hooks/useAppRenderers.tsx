import { useCallback } from 'react';
import PortalRouterManager, { PortalRouterViewModel } from '@/router/PortalRouterManager';
import AdminRouterManager from '@/router/AdminRouterManager';
import PortalShell from '@/modules/portal/components/PortalShell';
import { AppLanguage } from '@/i18n';
import { AppView, Employee, NewsItem, QuickToolDTO } from '@/types';
import { ThemeMode } from './useAppPreferences';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
type LicenseGateMode = 'full' | 'blocked' | 'read_only';

interface UseAppRenderersOptions {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  currentUser: any;
  t: TranslateFn;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  currentLanguage: AppLanguage;
  handleLanguageChange: (lang: AppLanguage) => void;
  portalViewModel: PortalRouterViewModel;
  onEnterAdminMode: () => void;
  effectiveAdminTab: string;
  handleAdminTabChange: (tab: string) => void;
  onExitAdmin: () => void;
  systemConfig: Record<string, string>;
  adminLicenseGateMode: LicenseGateMode;
  adminLicenseGateMessage: string;
  directoryLicenseBlocked: boolean;
  directoryLicenseBlockedMessage: string;
  customizationLicenseBlocked: boolean;
  customizationLicenseBlockedMessage: string;
  mfaSettingsLicenseBlocked: boolean;
  mfaSettingsLicenseBlockedMessage: string;
  employees: Employee[];
  newsList: NewsItem[];
  onDirectoryLicenseStateChange: (blocked: boolean, messageText: string) => void;
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
  onLogout: () => void;
  tools: QuickToolDTO[];
  footerDefaultText: string;
}

interface UseAppRenderersResult {
  renderAdmin: () => React.ReactNode;
  renderPortal: () => React.ReactNode;
}

export const useAppRenderers = ({
  currentView,
  setCurrentView,
  currentUser,
  t,
  themeMode,
  setThemeMode,
  currentLanguage,
  handleLanguageChange,
  portalViewModel,
  onEnterAdminMode,
  effectiveAdminTab,
  handleAdminTabChange,
  onExitAdmin,
  systemConfig,
  adminLicenseGateMode,
  adminLicenseGateMessage,
  directoryLicenseBlocked,
  directoryLicenseBlockedMessage,
  customizationLicenseBlocked,
  customizationLicenseBlockedMessage,
  mfaSettingsLicenseBlocked,
  mfaSettingsLicenseBlockedMessage,
  employees,
  newsList,
  onDirectoryLicenseStateChange,
  globalSearch,
  setGlobalSearch,
  onLogout,
  tools,
  footerDefaultText,
}: UseAppRenderersOptions): UseAppRenderersResult => {
  const renderView = useCallback(
    () => (
      <PortalRouterManager
        currentView={currentView}
        setCurrentView={setCurrentView}
        currentUser={currentUser}
        t={t}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        currentLanguage={currentLanguage}
        handleLanguageChange={handleLanguageChange}
        viewModel={portalViewModel}
        onEnterAdminMode={onEnterAdminMode}
      />
    ),
    [
      currentView,
      setCurrentView,
      currentUser,
      t,
      themeMode,
      setThemeMode,
      currentLanguage,
      handleLanguageChange,
      portalViewModel,
      onEnterAdminMode,
    ],
  );

  const renderAdmin = useCallback(
    () => (
      <AdminRouterManager
        effectiveAdminTab={effectiveAdminTab}
        onTabChange={handleAdminTabChange}
        onExit={onExitAdmin}
        systemConfig={systemConfig}
        adminLicenseGateMode={adminLicenseGateMode}
        adminLicenseGateMessage={adminLicenseGateMessage}
        directoryLicenseBlocked={directoryLicenseBlocked}
        directoryLicenseMessage={directoryLicenseBlockedMessage}
        customizationLicenseBlocked={customizationLicenseBlocked}
        customizationLicenseMessage={customizationLicenseBlockedMessage}
        mfaSettingsLicenseBlocked={mfaSettingsLicenseBlocked}
        mfaSettingsLicenseMessage={mfaSettingsLicenseBlockedMessage}
        employeesCount={employees.length}
        newsCount={newsList.length}
        onDirectoryLicenseStateChange={onDirectoryLicenseStateChange}
      />
    ),
    [
      effectiveAdminTab,
      handleAdminTabChange,
      onExitAdmin,
      systemConfig,
      adminLicenseGateMode,
      adminLicenseGateMessage,
      directoryLicenseBlocked,
      directoryLicenseBlockedMessage,
      customizationLicenseBlocked,
      customizationLicenseBlockedMessage,
      mfaSettingsLicenseBlocked,
      mfaSettingsLicenseBlockedMessage,
      employees.length,
      newsList.length,
      onDirectoryLicenseStateChange,
    ],
  );

  const renderPortal = useCallback(
    () => (
      <PortalShell
        currentView={currentView}
        setCurrentView={setCurrentView}
        globalSearch={globalSearch}
        setGlobalSearch={setGlobalSearch}
        onLogout={onLogout}
        tools={tools}
        newsList={newsList}
        employees={employees}
        currentUser={currentUser}
        systemConfig={systemConfig}
        footerDefaultText={footerDefaultText}
        renderView={renderView}
      />
    ),
    [
      currentView,
      setCurrentView,
      globalSearch,
      setGlobalSearch,
      onLogout,
      tools,
      newsList,
      employees,
      currentUser,
      systemConfig,
      footerDefaultText,
      renderView,
    ],
  );

  return {
    renderAdmin,
    renderPortal,
  };
};
