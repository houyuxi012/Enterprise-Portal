import { useCallback, useEffect, useState } from 'react';
import { Employee, NewsItem, QuickToolDTO, Todo } from '@/types';
import ApiClient from '@/shared/services/api';
import TodoService from '@/shared/services/todos';
import { hasAdminAccess } from '@/shared/utils/adminAccess';

export type LicenseGateMode = 'full' | 'blocked' | 'read_only';
type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const resolveLicenseGateState = (status: any, t: TranslateFn): { mode: LicenseGateMode; message: string } => {
  const installed = Boolean(status?.installed);
  const currentStatus = String(status?.status || '').toLowerCase();
  const reason = String(status?.reason || '').toUpperCase();

  if (!installed || currentStatus === 'missing' || reason === 'LICENSE_NOT_INSTALLED') {
    return { mode: 'blocked', message: t('appRoot.license.noLicense') };
  }
  if (currentStatus === 'expired' || reason === 'LICENSE_EXPIRED') {
    return { mode: 'read_only', message: t('appRoot.license.readOnly') };
  }
  if (
    currentStatus === 'invalid' ||
    reason === 'TIME_ROLLBACK' ||
    reason === 'LICENSE_NOT_YET_VALID' ||
    reason === 'LICENSE_INACTIVE'
  ) {
    return { mode: 'blocked', message: t('appRoot.license.invalid') };
  }
  return { mode: 'full', message: '' };
};

const extractLicenseErrorDetail = (error: any): { code?: string; message?: string; mode?: string } => {
  const detail = error?.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    return {
      code: typeof detail.code === 'string' ? detail.code : undefined,
      message: typeof detail.message === 'string' ? detail.message : undefined,
      mode: typeof detail.mode === 'string' ? detail.mode : undefined,
    };
  }
  return {};
};

const isLicenseGateBlockedError = (error: any): boolean => {
  const detail = extractLicenseErrorDetail(error);
  return (
    detail.code === 'LICENSE_REQUIRED' ||
    detail.code === 'LICENSE_READ_ONLY'
  );
};

const isLicenseFeatureEnabled = (features: any, featureName: string): boolean => {
  const feature = String(featureName || '').trim().toLowerCase();
  if (!feature) return false;

  if (Array.isArray(features)) {
    return features.some((item) => String(item || '').trim().toLowerCase() === feature);
  }
  if (features && typeof features === 'object') {
    const value = (features as Record<string, any>)[feature];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on', 'enabled'].includes(value.toLowerCase());
    return Boolean(value);
  }
  return false;
};

interface UseAppBootstrapOptions {
  isAuthenticated: boolean;
  currentUser: any;
  t: TranslateFn;
  emptyTodoPage: { items: never[]; total: number; page: number; page_size: number; total_pages: number };
  onEnableAdminMode: () => void;
  onForceAdminLicenseTab: () => void;
}

interface UseAppBootstrapResult {
  employees: Employee[];
  newsList: NewsItem[];
  tools: QuickToolDTO[];
  todos: Todo[];
  systemConfig: Record<string, string>;
  adminLicenseGateMode: LicenseGateMode;
  adminLicenseGateMessage: string;
  directoryLicenseBlocked: boolean;
  directoryLicenseBlockedMessage: string;
  customizationLicenseBlocked: boolean;
  customizationLicenseBlockedMessage: string;
  mfaSettingsLicenseBlocked: boolean;
  mfaSettingsLicenseBlockedMessage: string;
  portalLicenseBlocked: boolean;
  portalLicenseBlockedMessage: string;
  setDirectoryLicenseState: (blocked: boolean, messageText: string) => void;
}

export const useAppBootstrap = ({
  isAuthenticated,
  currentUser,
  t,
  emptyTodoPage,
  onEnableAdminMode,
  onForceAdminLicenseTab,
}: UseAppBootstrapOptions): UseAppBootstrapResult => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [tools, setTools] = useState<QuickToolDTO[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [systemConfig, setSystemConfig] = useState<Record<string, string>>({});

  const [adminLicenseGateMode, setAdminLicenseGateMode] = useState<LicenseGateMode>('full');
  const [adminLicenseGateMessage, setAdminLicenseGateMessage] = useState('');
  const [directoryLicenseBlocked, setDirectoryLicenseBlocked] = useState(false);
  const [directoryLicenseBlockedMessage, setDirectoryLicenseBlockedMessage] = useState('');
  const [customizationLicenseBlocked, setCustomizationLicenseBlocked] = useState(false);
  const [customizationLicenseBlockedMessage, setCustomizationLicenseBlockedMessage] = useState('');
  const [mfaSettingsLicenseBlocked, setMfaSettingsLicenseBlocked] = useState(false);
  const [mfaSettingsLicenseBlockedMessage, setMfaSettingsLicenseBlockedMessage] = useState('');
  const [portalLicenseBlocked, setPortalLicenseBlocked] = useState(false);
  const [portalLicenseBlockedMessage, setPortalLicenseBlockedMessage] = useState(t('appRoot.license.portalBlocked'));

  useEffect(() => {
    if (!portalLicenseBlocked) {
      setPortalLicenseBlockedMessage(t('appRoot.license.portalBlocked'));
    }
  }, [portalLicenseBlocked, t]);

  const applyBrandingConfig = useCallback((config: Record<string, string>) => {
    if (!config) return;

    const appName = String(config.app_name || '').trim();
    const logoUrl = String(config.logo_url || '').trim();
    const footerText = String(config.footer_text || '').trim();
    const browserTitle = String(config.browser_title || '').trim();
    const faviconUrl = String(config.favicon_url || '').trim();

    if (appName) localStorage.setItem('sys_app_name', appName);
    else localStorage.removeItem('sys_app_name');

    if (logoUrl) localStorage.setItem('sys_logo_url', logoUrl);
    else localStorage.removeItem('sys_logo_url');

    if (footerText) localStorage.setItem('sys_footer_text', footerText);
    else localStorage.removeItem('sys_footer_text');

    if (browserTitle) {
      document.title = browserTitle;
    } else if (appName) {
      document.title = appName;
    }

    if (faviconUrl) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) {
        link.href = faviconUrl;
      } else {
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        newLink.href = faviconUrl;
        document.head.appendChild(newLink);
      }
    } else {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) link.href = '/images/favicon.ico';
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchAppData = async () => {
      const isAdminPath = window.location.pathname.startsWith('/admin');
      const canUseAdminPlane = isAdminPath && hasAdminAccess(currentUser);
      let currentAdminGateMode: LicenseGateMode = 'full';
      let currentAdminGateMessage = '';
      let currentDirectoryLicenseBlocked = false;
      let currentDirectoryLicenseMessage = '';
      let currentCustomizationLicenseBlocked = false;
      let currentCustomizationLicenseMessage = '';
      let currentMfaSettingsLicenseBlocked = false;
      let currentMfaSettingsLicenseMessage = '';

      if (canUseAdminPlane) {
        onEnableAdminMode();

        try {
          const licenseStatus = await ApiClient.getLicenseStatus();
          const gate = resolveLicenseGateState(licenseStatus, t);
          currentAdminGateMode = gate.mode;
          currentAdminGateMessage = gate.message;
          if (currentAdminGateMode !== 'blocked') {
            try {
              const claims = await ApiClient.getLicenseClaims();
              const features = claims?.claims?.features;
              const ldapEnabled = isLicenseFeatureEnabled(features, 'ldap');
              const customizationEnabled = isLicenseFeatureEnabled(features, 'customization.manage');
              const mfaSettingsEnabled = isLicenseFeatureEnabled(features, 'mfa.settings');
              currentDirectoryLicenseBlocked = !ldapEnabled;
              currentDirectoryLicenseMessage = ldapEnabled ? '' : t('directory.license.alert');
              currentCustomizationLicenseBlocked = !customizationEnabled;
              currentCustomizationLicenseMessage = customizationEnabled ? '' : t('adminLayout.menu.customizationLicenseRequired');
              currentMfaSettingsLicenseBlocked = !mfaSettingsEnabled;
              currentMfaSettingsLicenseMessage = mfaSettingsEnabled ? '' : t('adminLayout.menu.mfaSettingsLicenseRequired');
            } catch (claimsError) {
              console.error('Failed to fetch license claims', claimsError);
            }
          }
        } catch (error: any) {
          const detail = extractLicenseErrorDetail(error);
          currentAdminGateMode = 'blocked';
          currentAdminGateMessage = detail.message || t('appRoot.license.readFailed');
          console.error('Failed to fetch license status', error);
        }

        setAdminLicenseGateMode(currentAdminGateMode);
        setAdminLicenseGateMessage(currentAdminGateMessage);
        setDirectoryLicenseBlocked(currentDirectoryLicenseBlocked);
        setDirectoryLicenseBlockedMessage(currentDirectoryLicenseMessage);
        setCustomizationLicenseBlocked(currentCustomizationLicenseBlocked);
        setCustomizationLicenseBlockedMessage(currentCustomizationLicenseMessage);
        setMfaSettingsLicenseBlocked(currentMfaSettingsLicenseBlocked);
        setMfaSettingsLicenseBlockedMessage(currentMfaSettingsLicenseMessage);
        if (currentAdminGateMode === 'blocked') {
          onForceAdminLicenseTab();
        }
      } else {
        setAdminLicenseGateMode('full');
        setAdminLicenseGateMessage('');
        setDirectoryLicenseBlocked(false);
        setDirectoryLicenseBlockedMessage('');
        setCustomizationLicenseBlocked(false);
        setCustomizationLicenseBlockedMessage('');
        setMfaSettingsLicenseBlocked(false);
        setMfaSettingsLicenseBlockedMessage('');
      }

      const shouldSkipBusinessFetch = canUseAdminPlane && currentAdminGateMode === 'blocked';
      const [employeesResult, newsResult, toolsResult, configResult, todosResult] = await Promise.allSettled([
        shouldSkipBusinessFetch ? Promise.resolve([] as Employee[]) : ApiClient.getEmployees(),
        shouldSkipBusinessFetch ? Promise.resolve([] as NewsItem[]) : ApiClient.getNews(),
        shouldSkipBusinessFetch ? Promise.resolve([] as QuickToolDTO[]) : ApiClient.getTools(),
        canUseAdminPlane && !shouldSkipBusinessFetch ? ApiClient.getSystemConfig() : ApiClient.getPublicSystemConfig(),
        canUseAdminPlane ? Promise.resolve(emptyTodoPage) : TodoService.getMyTasks({ page_size: 100 })
      ]);

      if (!canUseAdminPlane) {
        const licenseBlocked = [employeesResult, newsResult, toolsResult, todosResult].find((result) => (
          result.status === 'rejected' && isLicenseGateBlockedError(result.reason)
        ));
        if (licenseBlocked && licenseBlocked.status === 'rejected') {
          const detail = extractLicenseErrorDetail(licenseBlocked.reason);
          setPortalLicenseBlocked(true);
          setPortalLicenseBlockedMessage(detail.message || t('appRoot.license.portalBlocked'));
          setEmployees([]);
          setNewsList([]);
          setTools([]);
          setTodos([]);

          const configFallback = configResult.status === 'fulfilled' ? configResult.value : {};
          setSystemConfig(configFallback);
          applyBrandingConfig(configFallback);
          return;
        }
        setPortalLicenseBlocked(false);
      } else {
        setPortalLicenseBlocked(false);
      }

      if (employeesResult.status === 'fulfilled') {
        setEmployees(employeesResult.value);
      } else {
        console.error('Failed to fetch employees', employeesResult.reason);
      }

      if (newsResult.status === 'fulfilled') {
        setNewsList(newsResult.value);
      } else {
        console.error('Failed to fetch news', newsResult.reason);
      }

      if (toolsResult.status === 'fulfilled') {
        setTools(toolsResult.value);
      } else {
        console.error('Failed to fetch tools', toolsResult.reason);
      }

      const fetchedConfig = configResult.status === 'fulfilled' ? configResult.value : {};
      if (configResult.status === 'fulfilled') {
        setSystemConfig(fetchedConfig);
      } else {
        console.error('Failed to fetch config', configResult.reason);
      }

      if (todosResult.status === 'fulfilled') {
        setTodos(todosResult.value.items || []);
      } else {
        console.error('Failed to fetch todos', todosResult.reason);
      }

      applyBrandingConfig(fetchedConfig);
    };

    void fetchAppData();
  }, [
    isAuthenticated,
    currentUser?.account_type,
    currentUser?.roles,
    currentUser?.permissions,
    applyBrandingConfig,
    emptyTodoPage,
    onEnableAdminMode,
    onForceAdminLicenseTab,
    t,
  ]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let canceled = false;
    const refreshConfig = async () => {
      const isAdminPath = window.location.pathname.startsWith('/admin');
      const canUseAdminPlane = isAdminPath && hasAdminAccess(currentUser);
      const canReadAdminConfig = canUseAdminPlane && adminLicenseGateMode !== 'blocked';
      try {
        const latest = canReadAdminConfig
          ? await ApiClient.getSystemConfig()
          : await ApiClient.getPublicSystemConfig();
        if (canceled) return;
        setSystemConfig(latest);
        applyBrandingConfig(latest);
      } catch (error) {
        if (!canceled) {
          console.error('Failed to refresh system config', error);
        }
      }
    };

    const timer = window.setInterval(() => {
      void refreshConfig();
    }, 30000);
    const onFocus = () => {
      void refreshConfig();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      canceled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [
    isAuthenticated,
    currentUser?.account_type,
    currentUser?.roles,
    currentUser?.permissions,
    applyBrandingConfig,
    adminLicenseGateMode,
  ]);

  const setDirectoryLicenseState = useCallback((blocked: boolean, messageText: string) => {
    setDirectoryLicenseBlocked(blocked);
    setDirectoryLicenseBlockedMessage(messageText);
  }, []);

  return {
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
    portalLicenseBlocked,
    portalLicenseBlockedMessage,
    setDirectoryLicenseState,
  };
};
