import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Spin } from 'antd';
import { AppView, Employee, NewsItem, QuickToolDTO, Todo } from './types';
import ApiClient from './services/api';
import TodoService from './services/todos';
import { getIcon } from './utils/iconMap';
import { getColorClass } from './utils/colorMap';
import { hasAdminAccess } from './utils/adminAccess';
import {
  Mail, Monitor, Moon, Sun, Laptop, Sparkles, Languages
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppLanguage, buildUserLanguageScope, normalizeLanguage, setLanguagePreference } from './i18n';

type ThemeMode = 'light' | 'dark' | 'system';

interface FilterState {
  departments: string[];
}

import { useAuth } from './contexts/AuthContext';

const NEWS_CATEGORY_CODES = ['announcement', 'activity', 'policy', 'culture'] as const;
type NewsCategoryCode = (typeof NEWS_CATEGORY_CODES)[number];
const TOOL_CATEGORY_CODES = [
  'administration',
  'it',
  'finance',
  'hr',
  'engineering',
  'design',
  'marketing',
  'legal',
  'general',
  'other',
] as const;
type ToolCategoryCode = (typeof TOOL_CATEGORY_CODES)[number];

const TOOL_CATEGORY_BASE_ALIASES: Record<string, ToolCategoryCode> = {
  administration: 'administration',
  行政: 'administration',
  办公: 'administration',
  office: 'administration',
  it: 'it',
  信息技术: 'it',
  finance: 'finance',
  财务: 'finance',
  hr: 'hr',
  'human resources': 'hr',
  人力资源: 'hr',
  engineering: 'engineering',
  研发: 'engineering',
  开发: 'engineering',
  design: 'design',
  设计: 'design',
  marketing: 'marketing',
  营销: 'marketing',
  legal: 'legal',
  法律: 'legal',
  general: 'general',
  通用: 'general',
  other: 'other',
  其他: 'other',
};

const normalizeAliasKey = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '');

const NEWS_CATEGORY_LABEL_KEYS: Record<NewsCategoryCode, string> = {
  announcement: 'appRoot.news.tabAnnouncement',
  activity: 'appRoot.news.tabActivity',
  policy: 'appRoot.news.tabPolicy',
  culture: 'appRoot.news.tabCulture',
};

const Navbar = lazy(() => import('./components/Navbar'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const AIAssistant = lazy(() => import('./components/AIAssistant'));
const Login = lazy(() => import('./pages/Login'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const NewsList = lazy(() => import('./pages/admin/NewsList'));
const UserList = lazy(() => import('./pages/admin/UserList'));
const ToolList = lazy(() => import('./pages/admin/ToolList'));
const AppPermissions = lazy(() => import('./pages/admin/AppPermissions'));
const CarouselList = lazy(() => import('./pages/admin/CarouselList'));
const AnnouncementList = lazy(() => import('./pages/admin/AnnouncementList'));
const SystemSettings = lazy(() => import('./pages/admin/SystemSettings'));
const LicenseManagement = lazy(() => import('./pages/admin/LicenseManagement'));
const SecuritySettings = lazy(() => import('./pages/admin/SecuritySettings'));
const PasswordPolicy = lazy(() => import('./pages/admin/PasswordPolicy'));
const SystemUserList = lazy(() => import('./pages/admin/SystemUserList'));
const OnlineUsers = lazy(() => import('./pages/admin/OnlineUsers'));
const DirectoryListPage = lazy(() => import('./pages/admin/iam/directories'));
const RoleList = lazy(() => import('./pages/admin/RoleList'));
const OrganizationList = lazy(() => import('./pages/admin/OrganizationList'));
const BusinessLogs = lazy(() => import('./pages/admin/BusinessLogs'));
const AccessLogs = lazy(() => import('./pages/admin/logs/AccessLogs'));
const AboutUs = lazy(() => import('./pages/admin/AboutUs'));
const LogForwarding = lazy(() => import('./pages/admin/LogForwarding'));
const LogStorage = lazy(() => import('./pages/admin/LogStorage'));
const AIAudit = lazy(() => import('./pages/admin/logs/AIAudit'));
const ModelConfig = lazy(() => import('./pages/admin/ai/ModelConfig'));
const SecurityPolicy = lazy(() => import('./pages/admin/ai/SecurityPolicy'));
const AISettings = lazy(() => import('./pages/admin/ai/AISettings'));
const ModelUsagePage = lazy(() => import('./pages/admin/ai/ModelUsagePage'));
const KnowledgeBase = lazy(() => import('./pages/admin/ai/KnowledgeBase'));
const IAMAuditLogs = lazy(() => import('./pages/iam/AuditLogs'));
const TodoList = lazy(() => import('./pages/app/Todos'));
const AdminTodoList = lazy(() => import('./pages/admin/Todos'));

const SuspenseFallback: React.FC<{ fullScreen?: boolean }> = ({ fullScreen = false }) => (
  <div className={fullScreen ? 'min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900' : 'flex items-center justify-center py-16'}>
    <Spin size="large" />
  </div>
);

const AvatarWithFallback: React.FC<{ src?: string; name: string; className?: string }> = ({ src, name, className }) => {
  const [imgSrc, setImgSrc] = useState(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setImgSrc(src);
    setHasError(false);
  }, [src]);

  const fallbackUrl = '/images/default-avatar.svg';

  if (!src || hasError) {
    return <img src={fallbackUrl} className={className} alt={name} />;
  }

  return (
    <img
      src={imgSrc}
      className={className}
      alt={name}
      onError={() => setHasError(true)}
    />
  );
};

type LicenseGateMode = 'full' | 'blocked' | 'read_only';
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

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  // Use AuthContext instead of local state
  const { user: currentUser, isAuthenticated, isLoading, isInitialized, logout } = useAuth();
  const userLanguageScope = useMemo(
    () => buildUserLanguageScope(currentUser),
    [currentUser?.id, currentUser?.username],
  );

  // View State
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isAdminMode, setIsAdminMode] = useState(false);
  // Initialize from localStorage or default to 'dashboard'
  const [activeAdminTab, setActiveAdminTab] = useState<'dashboard' | 'news' | 'announcements' | 'employees' | 'users' | 'online_users' | 'directories' | 'tools' | 'app_permissions' | 'settings' | 'license' | 'about_us' | 'org' | 'roles' | 'system_logs' | 'business_logs' | 'access_logs' | 'ai_audit' | 'log_forwarding' | 'log_storage' | 'carousel' | 'security' | 'password_policy' | 'ai_models' | 'ai_security' | 'ai_settings' | 'ai_usage' | 'iam_audit_logs' | 'kb_manage' | 'todos'>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname.startsWith('/admin/iam/directories')) {
        return 'directories';
      }
      const saved = localStorage.getItem('activeAdminTab');
      // Validate saved tab exists in valid types/keys mostly implicitly or just trust it defaults if invalid render
      return (saved as any) || 'dashboard';
    }
    return 'dashboard';
  });

  // Persist admin active tab
  useEffect(() => {
    localStorage.setItem('activeAdminTab', activeAdminTab);
  }, [activeAdminTab]);

  useEffect(() => {
    const syncAdminTabByPath = () => {
      if (typeof window === 'undefined') return;
      if (window.location.pathname.startsWith('/admin/iam/directories')) {
        setActiveAdminTab('directories');
      } else if (window.location.pathname === '/admin' && activeAdminTab === 'directories') {
        setActiveAdminTab('dashboard');
      }
    };
    window.addEventListener('popstate', syncAdminTabByPath);
    return () => {
      window.removeEventListener('popstate', syncAdminTabByPath);
    };
  }, [activeAdminTab]);
  const [activeNewsTab, setActiveNewsTab] = useState('all');
  const [activeAppCategory, setActiveAppCategory] = useState('all');

  const [globalSearch, setGlobalSearch] = useState('');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantInitialPrompt, setAssistantInitialPrompt] = useState('');

  // Data State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [tools, setTools] = useState<QuickToolDTO[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [systemConfig, setSystemConfig] = useState<Record<string, string>>({});
  const [adminLicenseGateMode, setAdminLicenseGateMode] = useState<LicenseGateMode>('full');
  const [adminLicenseGateMessage, setAdminLicenseGateMessage] = useState('');
  const [directoryLicenseBlocked, setDirectoryLicenseBlocked] = useState(false);
  const [directoryLicenseBlockedMessage, setDirectoryLicenseBlockedMessage] = useState('');
  const [portalLicenseBlocked, setPortalLicenseBlocked] = useState(false);
  const [portalLicenseBlockedMessage, setPortalLicenseBlockedMessage] = useState(t('appRoot.license.portalBlocked'));

  // Team Filter State
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterState>({
    departments: [],
  });

  // Search AI Insights State
  const [searchAiInsight, setSearchAiInsight] = useState<string | null>(null);
  const [isSearchAiLoading, setIsSearchAiLoading] = useState(false);
  const emptyTodoPage = useMemo(
    () => ({ items: [], total: 0, page: 1, page_size: 100, total_pages: 0 }),
    []
  );
  const normalizeSearchText = useCallback((value: unknown) => String(value ?? '').toLowerCase(), []);
  const licenseCustomerName = useMemo(() => {
    const value = String(systemConfig?.customer_name || '').trim();
    if (!value || value === '-') return t('appRoot.news.customerFallback');
    return value;
  }, [systemConfig, t]);
  const toolCategoryAliases = useMemo(() => {
    const aliases: Record<string, ToolCategoryCode> = { ...TOOL_CATEGORY_BASE_ALIASES };
    const normalizedAliases: Record<string, ToolCategoryCode> = {};

    Object.entries(aliases).forEach(([key, code]) => {
      normalizedAliases[normalizeAliasKey(key)] = code;
      normalizedAliases[normalizeAliasKey(key.toUpperCase())] = code;
    });

    TOOL_CATEGORY_CODES.forEach((code) => {
      aliases[code] = code;
      aliases[code.toUpperCase()] = code;
      const zhLabel = String(i18n.t(`toolList.categories.${code}`, { lng: 'zh-CN' })).trim();
      const enLabel = String(i18n.t(`toolList.categories.${code}`, { lng: 'en-US' })).trim();
      if (zhLabel) {
        aliases[zhLabel] = code;
        normalizedAliases[normalizeAliasKey(zhLabel)] = code;
      }
      if (enLabel) {
        aliases[enLabel] = code;
        aliases[enLabel.toLowerCase()] = code;
        normalizedAliases[normalizeAliasKey(enLabel)] = code;
      }
    });

    return { aliases, normalizedAliases };
  }, [i18n.resolvedLanguage]);
  const toolCategoryKeywords = useMemo<Record<ToolCategoryCode, string[]>>(() => {
    const keywordConfig = i18n.t('appRoot.toolCategoryKeywords', {
      lng: 'zh-CN',
      returnObjects: true,
      defaultValue: {},
    }) as Record<string, unknown>;
    const toStringArray = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    return {
      engineering: toStringArray(keywordConfig.engineering),
      administration: toStringArray(keywordConfig.administration),
      marketing: toStringArray(keywordConfig.marketing),
      legal: toStringArray(keywordConfig.legal),
      finance: toStringArray(keywordConfig.finance),
      hr: toStringArray(keywordConfig.hr),
      design: toStringArray(keywordConfig.design),
      general: toStringArray(keywordConfig.general),
      other: toStringArray(keywordConfig.other),
      it: toStringArray(keywordConfig.it),
    };
  }, [i18n, i18n.resolvedLanguage]);

  const normalizeToolCategory = useCallback((value?: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return 'general';

    const direct =
      toolCategoryAliases.aliases[raw] || toolCategoryAliases.aliases[raw.toLowerCase()];
    if (direct) return direct;

    const normalized = normalizeAliasKey(raw);
    const normalizedMatch = toolCategoryAliases.normalizedAliases[normalized];
    if (normalizedMatch) return normalizedMatch;

    for (const [category, keywords] of Object.entries(toolCategoryKeywords)) {
      if (keywords.some((keyword) => raw.includes(keyword))) {
        return category;
      }
    }

    return raw;
  }, [toolCategoryAliases, toolCategoryKeywords]);

  const renderToolCategoryLabel = useCallback((value: string): string => {
    if (value === 'all') return t('common.status.all');
    if (TOOL_CATEGORY_CODES.includes(value as ToolCategoryCode)) {
      return t(`toolList.categories.${value}`);
    }
    return value;
  }, [t]);

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme-mode') as ThemeMode;
      return saved || 'system';
    }
    return 'system';
  });
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage || i18n.language);
  const handleLanguageChange = useCallback((nextLanguage: AppLanguage) => {
    setLanguagePreference(nextLanguage, userLanguageScope);
    void i18n.changeLanguage(nextLanguage);
  }, [i18n, userLanguageScope]);

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
      if (link) link.href = '/favicon.ico';
    }
  }, []);

  // Fetch App Data when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchAppData = async () => {
      const isAdminPath = window.location.pathname.startsWith('/admin');
      const canUseAdminPlane = isAdminPath && hasAdminAccess(currentUser);
      let currentAdminGateMode: LicenseGateMode = 'full';
      let currentAdminGateMessage = '';
      let currentDirectoryLicenseBlocked = false;
      let currentDirectoryLicenseMessage = '';

      // Check for Admin Mode preference or URL
      if (canUseAdminPlane) {
        setIsAdminMode(true);

        try {
          const licenseStatus = await ApiClient.getLicenseStatus();
          const gate = resolveLicenseGateState(licenseStatus, t);
          currentAdminGateMode = gate.mode;
          currentAdminGateMessage = gate.message;
          if (currentAdminGateMode !== 'blocked') {
            try {
              const claims = await ApiClient.getLicenseClaims();
              const ldapEnabled = isLicenseFeatureEnabled(claims?.claims?.features, 'ldap');
              currentDirectoryLicenseBlocked = !ldapEnabled;
              currentDirectoryLicenseMessage = ldapEnabled ? '' : t('directory.license.alert');
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
        if (currentAdminGateMode === 'blocked') {
          setActiveAdminTab('license');
        }
      } else {
        setAdminLicenseGateMode('full');
        setAdminLicenseGateMessage('');
        setDirectoryLicenseBlocked(false);
        setDirectoryLicenseBlockedMessage('');
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

    fetchAppData();
  }, [isAuthenticated, currentUser?.account_type, currentUser?.roles, currentUser?.permissions, applyBrandingConfig, emptyTodoPage, t]);

  // Keep branding synced when backend config changes during active sessions.
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
  }, [isAuthenticated, currentUser?.account_type, currentUser?.roles, currentUser?.permissions, applyBrandingConfig, adminLicenseGateMode]);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (mode: ThemeMode) => {
      let actualTheme = mode;
      if (mode === 'system') {
        actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      if (actualTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };
    applyTheme(themeMode);
    localStorage.setItem('theme-mode', themeMode);
    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [themeMode]);

  useEffect(() => {
    if (currentView === AppView.SEARCH_RESULTS && globalSearch.trim()) {
      // Check config to see if AI search is enabled
      if (systemConfig && systemConfig.search_ai_enabled === 'false') {
        setSearchAiInsight(null);
        setIsSearchAiLoading(false);
        return;
      }

      const fetchInsight = async () => {
        setIsSearchAiLoading(true);
        // Log Search Action
        ApiClient.logBusinessAction({
          action: 'SEARCH_QUERY',
          target: 'AI_INSIGHT',
          detail: `User searched for: ${globalSearch}`
        });

        const prompt = t('appRoot.search.aiPrompt', { query: globalSearch });
        try {
          const response = await ApiClient.chatAI(prompt);
          setSearchAiInsight(response);
        } catch (e) {
          setSearchAiInsight(t('appRoot.search.aiFailed'));
        }
        setIsSearchAiLoading(false);
      };
      fetchInsight();
    } else if (currentView !== AppView.SEARCH_RESULTS) {
      setSearchAiInsight(null);
    }
  }, [currentView, globalSearch, systemConfig, t]);

  const filteredTools = useMemo(() => {
    const keyword = normalizeSearchText(globalSearch);
    return tools.filter(tool =>
      normalizeSearchText(tool?.name).includes(keyword) ||
      normalizeSearchText(tool?.category).includes(keyword)
    );
  }, [globalSearch, tools, normalizeSearchText]);

  const filteredNews = useMemo(() => {
    const keyword = normalizeSearchText(globalSearch);
    return newsList.filter(news =>
      normalizeSearchText(news?.title).includes(keyword) ||
      normalizeSearchText(news?.summary).includes(keyword)
    );
  }, [globalSearch, newsList, normalizeSearchText]);

  const filteredTodos = useMemo(() => {
    const keyword = normalizeSearchText(globalSearch);
    return todos.filter(todo =>
      normalizeSearchText(todo?.title).includes(keyword) ||
      normalizeSearchText(todo?.description).includes(keyword)
    );
  }, [globalSearch, todos, normalizeSearchText]);

  const filteredEmployees = useMemo(() => {
    const keyword = normalizeSearchText(globalSearch);
    return employees.filter(emp => {
      const matchesSearch =
        normalizeSearchText(emp?.name).includes(keyword) ||
        normalizeSearchText(emp?.role).includes(keyword) ||
        normalizeSearchText(emp?.department).includes(keyword);

      const matchesDept =
        activeFilters.departments.length === 0 ||
        activeFilters.departments.includes(String(emp?.department ?? ''));

      return matchesSearch && matchesDept;
    });
  }, [globalSearch, activeFilters, employees, normalizeSearchText]);

  const newsCategoryAliases = useMemo(() => {
    const aliases: Record<string, NewsCategoryCode> = {} as Record<string, NewsCategoryCode>;
    NEWS_CATEGORY_CODES.forEach((code) => {
      aliases[code] = code;
      const key = NEWS_CATEGORY_LABEL_KEYS[code];
      const zhLabel = String(i18n.t(key, { lng: 'zh-CN' })).trim();
      const enLabel = String(i18n.t(key, { lng: 'en-US' })).trim();
      if (zhLabel) aliases[zhLabel] = code;
      if (enLabel) aliases[enLabel] = code;
    });
    return aliases;
  }, [i18n.resolvedLanguage, i18n]);

  const normalizeNewsCategory = useCallback((value?: string): NewsCategoryCode => {
    const raw = String(value || '').trim();
    if (raw in newsCategoryAliases) {
      return newsCategoryAliases[raw];
    }
    const lowerRaw = raw.toLowerCase();
    if (lowerRaw in newsCategoryAliases) {
      return newsCategoryAliases[lowerRaw];
    }
    return 'announcement';
  }, [newsCategoryAliases]);

  const handleOpenAssistantWithPrompt = (prompt: string) => {
    setAssistantInitialPrompt(prompt);
    setIsAssistantOpen(true);
  };

  const handleLogout = () => {
    logout();
  };

  const renderView = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard
          onViewAll={() => setCurrentView(AppView.TOOLS)}
          onNavigateToDirectory={() => setCurrentView(AppView.DIRECTORY)}
          onNavigateToTodos={() => setCurrentView(AppView.TODOS)}
          employees={employees}
          currentUser={currentUser}
        />;
      case AppView.SETTINGS:
        return (
          <div className="space-y-12 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('appRoot.settings.title')}</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">{t('appRoot.settings.subtitle')}</p>
            </div>

            {/* Admin Entry Point */}
            {hasAdminAccess(currentUser) && (
              <div className="mica rounded-[2.5rem] p-8 shadow-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
                <h3 className="text-lg font-bold mb-4 text-blue-800 dark:text-blue-300">{t('appRoot.settings.adminZoneTitle')}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('appRoot.settings.adminZoneDesc')}</p>
                <button
                  onClick={() => {
                    setIsAdminMode(true);
                    window.history.pushState({}, '', '/admin');
                  }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/30"
                >
                  {t('appRoot.settings.enterAdmin')}
                </button>
              </div>
            )}

            {/* Existing Settings content */}
            <div className="mica rounded-[2.5rem] p-8 shadow-xl">
              <h3 className="text-lg font-bold mb-6 flex items-center">
                <Monitor size={16} className="text-blue-600 mr-3" />
                {t('appRoot.settings.themeTitle')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { id: 'light', icon: <Sun size={18} />, label: t('appRoot.settings.theme.light') },
                  { id: 'dark', icon: <Moon size={18} />, label: t('appRoot.settings.theme.dark') },
                  { id: 'system', icon: <Laptop size={18} />, label: t('appRoot.settings.theme.system') }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setThemeMode(mode.id as ThemeMode)}
                    className={`group relative flex items-center space-x-3 p-4 rounded-3xl transition-all duration-300 ${themeMode === mode.id ? 'bg-blue-600 text-white shadow-xl -translate-y-1' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    <div className={`p-2 rounded-2xl transition-colors ${themeMode === mode.id ? 'bg-white/20' : 'bg-white dark:bg-slate-700 shadow-sm'}`}>
                      {mode.icon}
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-widest">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mica rounded-[2.5rem] p-8 shadow-xl">
              <h3 className="text-lg font-bold mb-3 flex items-center">
                <Languages size={16} className="text-blue-600 mr-3" />
                {t('appRoot.settings.languageTitle')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                {t('appRoot.settings.languageDesc')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { id: 'zh-CN' as AppLanguage, badge: t('common.language.badges.zhCN'), label: t('common.language.zhCN') },
                  { id: 'en-US' as AppLanguage, badge: 'EN', label: t('common.language.enUS') },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleLanguageChange(item.id)}
                    className={`group relative flex items-center space-x-3 p-4 rounded-3xl transition-all duration-300 ${currentLanguage === item.id
                      ? 'bg-blue-600 text-white shadow-xl -translate-y-1'
                      : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                  >
                    <div className={`p-2 rounded-2xl transition-colors ${currentLanguage === item.id ? 'bg-white/20' : 'bg-white dark:bg-slate-700 shadow-sm'}`}>
                      <span className="inline-flex min-w-6 justify-center text-xs font-black tracking-wide">{item.badge}</span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-widest">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case AppView.TOOLS:
        const appCategories = ['all', ...Array.from(new Set(tools.map(t => normalizeToolCategory(t.category)).filter(Boolean)))];
        const tabFilteredTools = filteredTools.filter(t => {
          if (activeAppCategory === 'all') return true;
          return normalizeToolCategory(t.category) === activeAppCategory;
        });

        return (
          <div className="space-y-12 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('appRoot.tools.title')}</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">{t('appRoot.tools.subtitle')}</p>
              </div>

              <div className="flex space-x-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar max-w-full">
                {appCategories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveAppCategory(category)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 whitespace-nowrap ${activeAppCategory === category
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    {renderToolCategoryLabel(category)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {tabFilteredTools.map(tool => (
                <a
                  key={tool.id}
                  href={tool.url}
                  target="_blank"
                  onClick={() => {
                    ApiClient.logBusinessAction({
                      action: 'APP_LAUNCH',
                      target: tool.name,
                      detail: `Launched tool: ${tool.name} (URL: ${tool.url})`
                    });
                  }}
                  className="group flex flex-col items-center p-8 mica rounded-organic hover:bg-white dark:hover:bg-slate-800 hover:-translate-y-3 transition-all duration-500 shadow-xl shadow-slate-200/20 dark:shadow-none"
                >
                  <div className={`w-16 h-16 ${!tool.image ? getColorClass(tool.color) : 'bg-white'} rounded-organic flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 transition-transform duration-500 rim-glow overflow-hidden`}>
                    {tool.image ? (
                      <img src={tool.image} alt={tool.name} className="w-full h-full object-cover" />
                    ) : (
                      getIcon(tool.icon_name, { size: 32 })
                    )}
                  </div>
                  <h3 className="text-sm font-black text-center text-slate-800 dark:text-slate-100 uppercase tracking-tighter">{tool.name}</h3>
                </a>
              ))}
            </div>
          </div>
        );
      case AppView.NEWS:
        const newsKeyword = normalizeSearchText(globalSearch);
        const newsTabs = [
          { value: 'all', label: t('common.status.all') },
          ...NEWS_CATEGORY_CODES.map((code) => ({
            value: code,
            label: t(NEWS_CATEGORY_LABEL_KEYS[code]),
          })),
        ];
        const tabFilteredNews = newsList.filter(n => {
          if (activeNewsTab === 'all') return true;
          return normalizeNewsCategory(n.category) === activeNewsTab;
        }).filter(news =>
          normalizeSearchText(news?.title).includes(newsKeyword) ||
          normalizeSearchText(news?.summary).includes(newsKeyword)
        );

        return (
          <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('appRoot.news.title')}</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">{t('appRoot.news.subtitle', { customer: licenseCustomerName })}</p>
              </div>

              {/* Tabs */}
              <div className="flex space-x-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {newsTabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveNewsTab(tab.value)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${activeNewsTab === tab.value
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tabFilteredNews.map(news => {
                const categoryCode = normalizeNewsCategory(news.category);
                return (
                  <div key={news.id} className="group bg-white dark:bg-slate-800 rounded-[1.5rem] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 flex flex-col h-full border border-slate-100 dark:border-slate-700/50">
                  {/* Image Container */}
                  <div className="relative h-40 overflow-hidden">
                    <img src={news.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    {/* Badge */}
                    <span className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-black text-white shadow-lg backdrop-blur-md ${categoryCode === 'announcement' ? 'bg-indigo-500/90' :
                      categoryCode === 'activity' ? 'bg-blue-500/90' :
                        categoryCode === 'policy' ? 'bg-rose-500/90' : 'bg-emerald-500/90'
                      }`}>
                      {t(NEWS_CATEGORY_LABEL_KEYS[categoryCode])}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="p-5 flex flex-col flex-1">
                    {/* Meta Row */}
                    <div className="flex items-center text-[10px] font-bold text-slate-400 mb-2 tracking-wide uppercase">
                      <span>{news.date}</span>
                      <span className="mx-2 text-slate-300">|</span>
                      <span>{news.author}</span>
                    </div>

                    {/* Title */}
                    <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
                      {news.title}
                    </h2>

                    {/* Summary */}
                    <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed line-clamp-2 mb-4 flex-1">
                      {news.summary}
                    </p>

                    {/* Footer / Action */}
                    <div className="flex items-center text-blue-600 dark:text-blue-400 text-xs font-bold group/btn">
                      <span>{t('appRoot.news.readMore')}</span>
                      <svg className="w-3.5 h-3.5 ml-1 transform group-hover/btn:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            {tabFilteredNews.length === 0 && (
              <div className="text-center py-20 text-slate-400 font-bold">{t('appRoot.news.empty')}</div>
            )}
          </div>
        );
      case AppView.DIRECTORY:
        return (
          <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('appRoot.directory.title')}</h1>
            <div className="mica rounded-organic overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('appRoot.directory.member')}</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('appRoot.directory.department')}</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('appRoot.directory.role')}</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('appRoot.directory.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map(emp => (
                    <tr key={emp.id} className="border-t border-slate-50 dark:border-slate-800/50">
                      <td className="px-8 py-4">
                        <div className="flex items-center space-x-3">
                          <AvatarWithFallback src={emp.avatar} name={emp.name} className="w-10 h-10 rounded-full" />
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{emp.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-xs font-bold text-slate-500">{emp.department}</td>
                      <td className="px-8 py-4 text-xs font-bold text-slate-500">{emp.role || '-'}</td>
                      <td className="px-8 py-4"><Mail size={16} className="text-blue-600 cursor-pointer" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case AppView.SEARCH_RESULTS:
        return (
          <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('appRoot.search.title')}</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">
                {t('appRoot.search.keywordSummary', { query: globalSearch })}
              </p>
            </div>

            {isSearchAiLoading ? (
              <div className="mica p-6 rounded-[2rem] flex items-center space-x-4 animate-pulse">
                <Sparkles size={24} className="text-blue-500" />
                <span className="text-slate-500 font-bold">{t('appRoot.search.aiLoading')}</span>
              </div>
            ) : searchAiInsight && (
              <div className="mica p-6 rounded-[2rem] border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
                <div className="flex items-center space-x-2 mb-2 text-blue-600 dark:text-blue-400">
                  <Sparkles size={18} />
                  <span className="font-black uppercase tracking-widest text-xs">{t('appRoot.search.aiInsight')}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-medium">
                  {searchAiInsight}
                </p>
              </div>
            )}

            {filteredTools.length > 0 && (
              <div>
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-200">{t('appRoot.search.relatedApps')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {filteredTools.map(tool => (
                    <a
                      key={tool.id}
                      href={tool.url}
                      className="group flex flex-col items-center p-6 mica rounded-organic hover:bg-white dark:hover:bg-slate-800 hover:-translate-y-2 transition-all duration-500 shadow-lg"
                    >
                      <div className={`w-12 h-12 ${!tool.image ? getColorClass(tool.color) : 'bg-white'} rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform overflow-hidden`}>
                        {tool.image ? (
                          <img src={tool.image} alt={tool.name} className="w-full h-full object-cover" />
                        ) : (
                          getIcon(tool.icon_name, { size: 24 })
                        )}
                      </div>
                      <h3 className="text-xs font-black text-center text-slate-800 dark:text-slate-100 uppercase tracking-tighter">{tool.name}</h3>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {filteredNews.length > 0 && (
              <div>
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-200">{t('appRoot.search.relatedNews')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredNews.map(news => (
                    <div key={news.id} className="group mica rounded-[2rem] overflow-hidden shadow-lg p-4 flex items-center space-x-4 hover:bg-white dark:hover:bg-slate-800 transition text-left cursor-pointer">
                      <img src={news.image} className="w-20 h-16 rounded-xl object-cover shrink-0" />
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm line-clamp-1 group-hover:text-blue-600 transition-colors">{news.title}</h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{news.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredEmployees.length > 0 && (
              <div>
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-200">{t('appRoot.search.relatedPeople')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {filteredEmployees.map(emp => (
                    <div key={emp.id} className="mica rounded-3xl p-4 flex items-center space-x-4">
                      <AvatarWithFallback src={emp.avatar} name={emp.name} className="w-12 h-12 rounded-full shadow-sm" />
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">{emp.name}</h4>
                        <p className="text-xs text-slate-500 font-medium">{emp.role} · {emp.department}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredTodos.length > 0 && (
              <div>
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-200">{t('appRoot.search.relatedTodos')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTodos.map(todo => (
                    <div key={todo.id} className="group mica rounded-[2rem] overflow-hidden shadow-lg p-5 flex flex-col hover:bg-white dark:hover:bg-slate-800 transition text-left cursor-pointer border border-slate-100 dark:border-slate-700/50" onClick={() => setCurrentView(AppView.TODOS)}>
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm line-clamp-2 group-hover:text-blue-600 transition-colors flex-1 pr-4">{todo.title}</h4>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase shadow-sm ${todo.priority === 3 ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                          todo.priority === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' :
                          todo.priority === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                              'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                          }`}>
                          {todo.priority === 3
                            ? t('appRoot.search.todoPriority.emergency')
                            : todo.priority === 2
                              ? t('appRoot.search.todoPriority.high')
                              : todo.priority === 1
                                ? t('appRoot.search.todoPriority.medium')
                                : t('appRoot.search.todoPriority.low')}
                        </span>
                      </div>
                      {todo.description && <p className="text-xs text-slate-500 line-clamp-2 mb-4 flex-1">{todo.description}</p>}
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{new Date(todo.created_at).toLocaleDateString()}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${todo.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                          todo.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                            todo.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                              'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                          {todo.status === 'pending'
                            ? t('appRoot.search.todoStatus.pending')
                            : todo.status === 'in_progress'
                              ? t('appRoot.search.todoStatus.inProgress')
                              : todo.status === 'completed'
                                ? t('appRoot.search.todoStatus.completed')
                                : t('appRoot.search.todoStatus.canceled')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredTools.length === 0 && filteredNews.length === 0 && filteredEmployees.length === 0 && filteredTodos.length === 0 && (
              <div className="text-center py-20">
                <p className="text-slate-400 font-bold">{t('appRoot.search.empty')}</p>
              </div>
            )}
          </div>
        );
      case AppView.TODOS:
        return <TodoList />;
      case AppView.DIRECTORY:
        return (
          <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('appRoot.directory.title')}</h1>
            <div className="mica rounded-organic overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('appRoot.directory.member')}</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('appRoot.directory.department')}</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('appRoot.directory.role')}</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('appRoot.directory.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map(emp => (
                    <tr key={emp.id} className="border-t border-slate-50 dark:border-slate-800/50">
                      <td className="px-8 py-4">
                        <div className="flex items-center space-x-3">
                          <img src={emp.avatar || '/images/default-avatar.svg'} className="w-10 h-10 rounded-full" />
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{emp.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-xs font-bold text-slate-500">{emp.department}</td>
                      <td className="px-8 py-4 text-xs font-bold text-slate-500">{emp.role || '-'}</td>
                      <td className="px-8 py-4"><Mail size={16} className="text-blue-600 cursor-pointer" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      default:
        return <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest">{t('appRoot.comingSoon')}</div>;
    }
  };

  const effectiveAdminTab = adminLicenseGateMode === 'blocked' ? 'license' : activeAdminTab;

  if (isLoading && !isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      return (
        <Suspense fallback={<SuspenseFallback fullScreen />}>
          <AdminLogin onLoginSuccess={() => {
            // Auth state is updated via context after successful login
            setIsAdminMode(true);
            window.history.pushState({}, '', '/admin');
          }} />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<SuspenseFallback fullScreen />}>
        <Login onLoginSuccess={() => {
          // Auth state is updated via context after successful login
        }} />
      </Suspense>
    );
  }

  if (isAdminMode) {
    return (
      <Suspense fallback={<SuspenseFallback fullScreen />}>
        <AdminLayout
          activeTab={effectiveAdminTab as any}
          onTabChange={(tab: any) => {
            if (adminLicenseGateMode === 'blocked' && tab !== 'license') {
              setActiveAdminTab('license');
              return;
            }
            setActiveAdminTab(tab);
            if (typeof window !== 'undefined') {
              const nextPath = tab === 'directories' ? '/admin/iam/directories' : '/admin';
              window.history.pushState({}, '', nextPath);
            }
          }}
          onExit={() => {
            setIsAdminMode(false);
            window.history.pushState({}, '', '/');
          }}
          footerText={systemConfig.footer_text}
          logoUrl={systemConfig.logo_url}
          appName={systemConfig.app_name}
          licenseGateMode={adminLicenseGateMode}
          licenseGateMessage={adminLicenseGateMessage}
          directoryLicenseBlocked={directoryLicenseBlocked}
          directoryLicenseMessage={directoryLicenseBlockedMessage}
        >
          {effectiveAdminTab === 'dashboard' && <AdminDashboard employeeCount={employees.length} newsCount={newsList.length} />}
          {effectiveAdminTab === 'news' && <NewsList />}
          {effectiveAdminTab === 'carousel' && <CarouselList />}
          {effectiveAdminTab === 'announcements' && <AnnouncementList />}
          {effectiveAdminTab === 'employees' && <UserList />}
          {effectiveAdminTab === 'users' && <SystemUserList />}
          {effectiveAdminTab === 'online_users' && <OnlineUsers />}
          {effectiveAdminTab === 'directories' && (
            <DirectoryListPage
              onLicenseStateChange={(blocked, messageText) => {
                setDirectoryLicenseBlocked(blocked);
                setDirectoryLicenseBlockedMessage(messageText);
              }}
            />
          )}
          {effectiveAdminTab === 'roles' && <RoleList />}
          {effectiveAdminTab === 'tools' && <ToolList />}
          {effectiveAdminTab === 'app_permissions' && <AppPermissions />}
          {effectiveAdminTab === 'settings' && <SystemSettings />}
          {effectiveAdminTab === 'license' && <LicenseManagement />}
          {effectiveAdminTab === 'security' && <SecuritySettings />}
          {effectiveAdminTab === 'password_policy' && <PasswordPolicy />}
          {effectiveAdminTab === 'org' && <OrganizationList />}
          {effectiveAdminTab === 'business_logs' && <BusinessLogs />}
          {effectiveAdminTab === 'access_logs' && <AccessLogs />}
          {effectiveAdminTab === 'iam_audit_logs' && <IAMAuditLogs />}
          {effectiveAdminTab === 'ai_audit' && <AIAudit />}
          {effectiveAdminTab === 'log_forwarding' && <LogForwarding />}
          {effectiveAdminTab === 'log_storage' && <LogStorage />}
          {effectiveAdminTab === 'ai_models' && <ModelConfig />}
          {effectiveAdminTab === 'ai_security' && <SecurityPolicy />}
          {effectiveAdminTab === 'ai_settings' && <AISettings />}
          {effectiveAdminTab === 'ai_usage' && <ModelUsagePage />}
          {effectiveAdminTab === 'kb_manage' && <KnowledgeBase />}
          {effectiveAdminTab === 'todos' && <AdminTodoList />}
          {effectiveAdminTab === 'about_us' && <AboutUs />}
        </AdminLayout>
      </Suspense>
    );
  }

  // If authenticated but visiting /admin as non-admin, force Admin Login to allow switch
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return (
      <Suspense fallback={<SuspenseFallback fullScreen />}>
        <AdminLogin onLoginSuccess={() => {
          // Reload to refresh token and user state
          window.location.reload();
        }} />
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

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-600 selection:text-white transition-colors">
      {isAuthenticated && (
        <Suspense fallback={<SuspenseFallback />}>
          <Navbar
            currentView={currentView}
            setView={setCurrentView}
            globalSearch={globalSearch}
            setGlobalSearch={setGlobalSearch}
            onAskAI={(prompt) => {
              setIsAssistantOpen(true);
              setAssistantInitialPrompt(prompt);
            }}
            onLogout={handleLogout}
            tools={tools}
            news={newsList}
            employees={employees}
            currentUser={currentUser}
            systemConfig={systemConfig}
          />
        </Suspense>
      )}
      <main className="flex-1 mt-24 px-6 sm:px-8 pb-16">
        <div className="max-w-7xl mx-auto">
          <Suspense fallback={<SuspenseFallback />}>
            {renderView()}
          </Suspense>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-400 dark:text-slate-600 font-medium tracking-wide">
        {systemConfig.footer_text || t('appRoot.footerDefault')}
      </footer>

      <Suspense fallback={null}>
        <AIAssistant
          isOpen={isAssistantOpen}
          setIsOpen={setIsAssistantOpen}
          initialPrompt={assistantInitialPrompt}
        />
      </Suspense>
    </div>
  );
};

export default App;
