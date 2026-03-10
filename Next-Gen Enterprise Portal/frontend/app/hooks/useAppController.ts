import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRouteGuardsProps } from '@/router/AppRouteGuards';
import { useAppBootstrap } from './useAppBootstrap';
import { usePortalViewModel } from '@/modules/portal/hooks/usePortalViewModel';
import { usePortalRouterViewModel } from '@/modules/portal/hooks/usePortalRouterViewModel';
import { useAdminTabGate } from '@/modules/admin/hooks/useAdminTabGate';
import { useAppPreferences } from './useAppPreferences';
import { useAppRenderers } from './useAppRenderers';
import { useAppModeState } from './useAppModeState';
import { usePortalViewState } from '@/modules/portal/hooks/usePortalViewState';
import { usePortalUiState } from '@/modules/portal/hooks/usePortalUiState';
import { useAppGuardProps } from './useAppGuardProps';

const EMPTY_DEPARTMENT_FILTERS: string[] = [];
const EMPTY_TODO_PAGE = { items: [] as never[], total: 0, page: 1, page_size: 100, total_pages: 0 };

export const useAppController = (): AppRouteGuardsProps => {
  const { t, i18n } = useTranslation();
  const { user: currentUser, isAuthenticated, isLoading, isInitialized, logout } = useAuth();
  const { currentView, setCurrentView } = usePortalViewState();
  const {
    isAdminMode,
    isAdminPath,
    activeAdminTab,
    setActiveAdminTab,
    syncAdminTabPath,
    enterAdminMode,
    enableAdminMode,
    exitAdminMode,
    forceAdminLicenseTab,
    handleAdminLoginSuccess,
    handleAdminReloginSuccess,
  } = useAppModeState();
  const {
    activeNewsTab,
    setActiveNewsTab,
    activeAppCategory,
    setActiveAppCategory,
    globalSearch,
    setGlobalSearch,
  } = usePortalUiState();

  const {
    employees,
    newsList,
    tools,
    todos,
    systemConfig,
    adminLicenseGateMode,
    adminLicenseGateMessage,
    directoryLicenseBlocked,
    directoryLicenseBlockedMessage,
    customizationLicenseBlocked,
    customizationLicenseBlockedMessage,
    mfaSettingsLicenseBlocked,
    mfaSettingsLicenseBlockedMessage,
    meetingManagementLicenseBlocked,
    meetingManagementLicenseBlockedMessage,
    portalLicenseBlocked,
    portalLicenseBlockedMessage,
    setDirectoryLicenseState,
  } = useAppBootstrap({
    isAuthenticated,
    currentUser,
    t,
    emptyTodoPage: EMPTY_TODO_PAGE,
    onEnableAdminMode: enableAdminMode,
    onForceAdminLicenseTab: forceAdminLicenseTab,
  });

  const {
    themeMode,
    setThemeMode,
    currentLanguage,
    handleLanguageChange,
  } = useAppPreferences({ i18n, currentUser });

  const {
    effectiveAdminTab,
    handleAdminTabChange,
  } = useAdminTabGate({
    activeAdminTab,
    adminLicenseGateMode,
    mfaSettingsLicenseBlocked,
    meetingManagementLicenseBlocked,
    setActiveAdminTab,
    syncAdminTabPath,
  });

  const portalData = usePortalViewModel({
    currentView,
    globalSearch,
    systemConfig,
    tools,
    newsList,
    todos,
    employees,
    departments: EMPTY_DEPARTMENT_FILTERS,
    t,
    i18n,
  });
  const portalViewModel = usePortalRouterViewModel({
    globalSearch,
    activeAppCategory,
    setActiveAppCategory,
    activeNewsTab,
    setActiveNewsTab,
    tools,
    newsList,
    employees,
    ...portalData,
  });

  const { renderAdmin, renderPortal } = useAppRenderers({
    currentView,
    setCurrentView,
    currentUser,
    t,
    themeMode,
    setThemeMode,
    currentLanguage,
    handleLanguageChange,
    portalViewModel,
    onEnterAdminMode: enterAdminMode,
    effectiveAdminTab,
    handleAdminTabChange,
    onExitAdmin: exitAdminMode,
    systemConfig,
    adminLicenseGateMode,
    adminLicenseGateMessage,
    directoryLicenseBlocked,
    directoryLicenseBlockedMessage,
    customizationLicenseBlocked,
    customizationLicenseBlockedMessage,
    mfaSettingsLicenseBlocked,
    mfaSettingsLicenseBlockedMessage,
    meetingManagementLicenseBlocked,
    meetingManagementLicenseBlockedMessage,
    employees,
    newsList,
    onDirectoryLicenseStateChange: setDirectoryLicenseState,
    globalSearch,
    setGlobalSearch,
    onLogout: logout,
    tools,
    footerDefaultText: t('appRoot.footerDefault'),
  });

  return useAppGuardProps({
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
  });
};
