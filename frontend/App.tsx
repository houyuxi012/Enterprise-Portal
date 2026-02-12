import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Spin } from 'antd';
import { AppView, Employee, NewsItem, QuickToolDTO } from './types';
import ApiClient from './services/api';
import { getIcon } from './utils/iconMap';
import { getColorClass } from './utils/colorMap';
import { hasAdminAccess } from './utils/adminAccess';
import {
  Mail, Monitor, Moon, Sun, Laptop, Sparkles
} from 'lucide-react';

type ThemeMode = 'light' | 'dark' | 'system';

interface FilterState {
  departments: string[];
}

import { useAuth } from './contexts/AuthContext';

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
const SecuritySettings = lazy(() => import('./pages/admin/SecuritySettings'));
const SystemUserList = lazy(() => import('./pages/admin/SystemUserList'));
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

  const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;

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

const App: React.FC = () => {
  // Use AuthContext instead of local state
  const { user: currentUser, isAuthenticated, isLoading, logout } = useAuth();

  // View State
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isAdminMode, setIsAdminMode] = useState(false);
  // Initialize from localStorage or default to 'dashboard'
  const [activeAdminTab, setActiveAdminTab] = useState<'dashboard' | 'news' | 'announcements' | 'employees' | 'users' | 'tools' | 'app_permissions' | 'settings' | 'about_us' | 'org' | 'roles' | 'system_logs' | 'business_logs' | 'access_logs' | 'ai_audit' | 'log_forwarding' | 'log_storage' | 'carousel' | 'security' | 'ai_models' | 'ai_security' | 'ai_settings' | 'ai_usage' | 'iam_audit_logs' | 'kb_manage' | 'todos'>(() => {
    if (typeof window !== 'undefined') {
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
  const [activeNewsTab, setActiveNewsTab] = useState('全部');

  const [globalSearch, setGlobalSearch] = useState('');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantInitialPrompt, setAssistantInitialPrompt] = useState('');

  // Data State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [tools, setTools] = useState<QuickToolDTO[]>([]);
  const [systemConfig, setSystemConfig] = useState<Record<string, string>>({});

  // Team Filter State
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterState>({
    departments: [],
  });

  // Search AI Insights State
  const [searchAiInsight, setSearchAiInsight] = useState<string | null>(null);
  const [isSearchAiLoading, setIsSearchAiLoading] = useState(false);

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme-mode') as ThemeMode;
      return saved || 'system';
    }
    return 'system';
  });

  const applyBrandingConfig = useCallback((config: Record<string, string>) => {
    if (!config) return;

    if (config.app_name) {
      localStorage.setItem('sys_app_name', config.app_name);
    }
    if (config.logo_url) {
      localStorage.setItem('sys_logo_url', config.logo_url);
    }
    if (config.footer_text) {
      localStorage.setItem('sys_footer_text', config.footer_text);
    }

    if (config.browser_title) {
      document.title = config.browser_title;
    }
    if (config.favicon_url) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) {
        link.href = config.favicon_url;
      } else {
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        newLink.href = config.favicon_url;
        document.head.appendChild(newLink);
      }
    }
  }, []);

  // Fetch App Data when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchAppData = async () => {
      const isAdminPath = window.location.pathname.startsWith('/admin');
      const canUseAdminPlane = isAdminPath && hasAdminAccess(currentUser);

      // Check for Admin Mode preference or URL
      if (canUseAdminPlane) {
        setIsAdminMode(true);
      }

      const [employeesResult, newsResult, toolsResult, configResult] = await Promise.allSettled([
        ApiClient.getEmployees(),
        ApiClient.getNews(),
        ApiClient.getTools(),
        canUseAdminPlane ? ApiClient.getSystemConfig() : ApiClient.getPublicSystemConfig(),
      ]);

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

      applyBrandingConfig(fetchedConfig);
    };

    fetchAppData();
  }, [isAuthenticated, currentUser?.account_type, currentUser?.roles, currentUser?.permissions, applyBrandingConfig]);

  // Keep branding synced when backend config changes during active sessions.
  useEffect(() => {
    if (!isAuthenticated) return;

    let canceled = false;
    const refreshConfig = async () => {
      const isAdminPath = window.location.pathname.startsWith('/admin');
      const canUseAdminPlane = isAdminPath && hasAdminAccess(currentUser);
      try {
        const latest = canUseAdminPlane
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
  }, [isAuthenticated, currentUser?.account_type, currentUser?.roles, currentUser?.permissions, applyBrandingConfig]);

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

        const prompt = `作为一个企业内网助手，请针对搜索词“${globalSearch}”提供一个专业的概览。如果是寻找流程，请简述步骤；如果是寻找人或部门，请说明可能的对接方式。请保持简练。`;
        try {
          const response = await ApiClient.chatAI(prompt);
          setSearchAiInsight(response);
        } catch (e) {
          setSearchAiInsight("无法获取AI搜索洞察。");
        }
        setIsSearchAiLoading(false);
      };
      fetchInsight();
    } else if (currentView !== AppView.SEARCH_RESULTS) {
      setSearchAiInsight(null);
    }
  }, [currentView, globalSearch, systemConfig]);

  const filteredTools = useMemo(() => {
    return tools.filter(tool =>
      tool.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
      tool.category?.toLowerCase().includes(globalSearch.toLowerCase())
    );
  }, [globalSearch, tools]);

  const filteredNews = useMemo(() => {
    return newsList.filter(news =>
      news.title.toLowerCase().includes(globalSearch.toLowerCase()) ||
      news.summary.toLowerCase().includes(globalSearch.toLowerCase())
    );
  }, [globalSearch, newsList]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch =
        emp.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
        emp.role.toLowerCase().includes(globalSearch.toLowerCase()) ||
        emp.department.toLowerCase().includes(globalSearch.toLowerCase());

      const matchesDept = activeFilters.departments.length === 0 || activeFilters.departments.includes(emp.department);

      return matchesSearch && matchesDept;
    });
  }, [globalSearch, activeFilters, employees]);

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
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">偏好设置</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">定制您的 ShiKu Home 沉浸式体验</p>
            </div>

            {/* Admin Entry Point */}
            {hasAdminAccess(currentUser) && (
              <div className="mica rounded-[2.5rem] p-8 shadow-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
                <h3 className="text-lg font-bold mb-4 text-blue-800 dark:text-blue-300">管理员专区</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">您拥有管理员权限，可以进入后台管理系统。</p>
                <button
                  onClick={() => {
                    setIsAdminMode(true);
                    window.history.pushState({}, '', '/admin');
                  }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/30"
                >
                  进入后台管理
                </button>
              </div>
            )}

            {/* Existing Settings content */}
            <div className="mica rounded-[2.5rem] p-8 shadow-xl">
              <h3 className="text-lg font-bold mb-6 flex items-center">
                <Monitor size={16} className="text-blue-600 mr-3" />
                显示与主题
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { id: 'light', icon: <Sun size={18} />, label: '清新浅色' },
                  { id: 'dark', icon: <Moon size={18} />, label: '深邃暗色' },
                  { id: 'system', icon: <Laptop size={18} />, label: '智能跟随' }
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
          </div>
        );
      case AppView.TOOLS:
        return (
          <div className="space-y-12 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">应用中心</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">点击启动您的工作流</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {filteredTools.map(tool => (
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
        const tabFilteredNews = newsList.filter(n => {
          if (activeNewsTab === '全部') return true;
          return n.category === activeNewsTab;
        }).filter(news =>
          news.title.toLowerCase().includes(globalSearch.toLowerCase()) ||
          news.summary.toLowerCase().includes(globalSearch.toLowerCase())
        );

        return (
          <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">资讯中心</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">了解 ShiKu Home 的最新动态与深度报道</p>
              </div>

              {/* Tabs */}
              <div className="flex space-x-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {['全部', '公告', '活动', '政策', '文化'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveNewsTab(tab)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${activeNewsTab === tab
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tabFilteredNews.map(news => (
                <div key={news.id} className="group bg-white dark:bg-slate-800 rounded-[1.5rem] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 flex flex-col h-full border border-slate-100 dark:border-slate-700/50">
                  {/* Image Container */}
                  <div className="relative h-40 overflow-hidden">
                    <img src={news.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    {/* Badge */}
                    <span className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-black text-white shadow-lg backdrop-blur-md ${news.category === '公告' ? 'bg-indigo-500/90' :
                      news.category === '活动' ? 'bg-blue-500/90' :
                        news.category === '政策' ? 'bg-rose-500/90' : 'bg-emerald-500/90'
                      }`}>
                      {news.category}
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
                      <span>阅读全文</span>
                      <svg className="w-3.5 h-3.5 ml-1 transform group-hover/btn:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {tabFilteredNews.length === 0 && (
              <div className="text-center py-20 text-slate-400 font-bold">暂无此类资讯</div>
            )}
          </div>
        );
      case AppView.DIRECTORY:
        return (
          <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">团队通讯录</h1>
            <div className="mica rounded-organic overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">成员</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">部门</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">操作</th>
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
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">搜索结果</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">
                关键词 "{globalSearch}" 的相关内容
              </p>
            </div>

            {isSearchAiLoading ? (
              <div className="mica p-6 rounded-[2rem] flex items-center space-x-4 animate-pulse">
                <Sparkles size={24} className="text-blue-500" />
                <span className="text-slate-500 font-bold">正在生成 AI 洞察...</span>
              </div>
            ) : searchAiInsight && (
              <div className="mica p-6 rounded-[2rem] border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
                <div className="flex items-center space-x-2 mb-2 text-blue-600 dark:text-blue-400">
                  <Sparkles size={18} />
                  <span className="font-black uppercase tracking-widest text-xs">AI 智能洞察</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-medium">
                  {searchAiInsight}
                </p>
              </div>
            )}

            {filteredTools.length > 0 && (
              <div>
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-200">相关应用</h3>
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
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-200">相关资讯</h3>
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
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-200">相关人员</h3>
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

            {filteredTools.length === 0 && filteredNews.length === 0 && filteredEmployees.length === 0 && (
              <div className="text-center py-20">
                <p className="text-slate-400 font-bold">没有找到相关内容</p>
              </div>
            )}
          </div>
        );
      case AppView.TODOS:
        return <TodoList />;
      case AppView.DIRECTORY:
        return (
          <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">团队通讯录</h1>
            <div className="mica rounded-organic overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">成员</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">部门</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map(emp => (
                    <tr key={emp.id} className="border-t border-slate-50 dark:border-slate-800/50">
                      <td className="px-8 py-4">
                        <div className="flex items-center space-x-3">
                          <img src={emp.avatar} className="w-10 h-10 rounded-full" />
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{emp.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-xs font-bold text-slate-500">{emp.department}</td>
                      <td className="px-8 py-4"><Mail size={16} className="text-blue-600 cursor-pointer" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      default:
        return <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest">即将上线</div>;
    }
  };

  if (isLoading) {
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
          activeTab={activeAdminTab as any}
          onTabChange={(tab: any) => setActiveAdminTab(tab)}
          onExit={() => {
            setIsAdminMode(false);
            window.history.pushState({}, '', '/');
          }}
          footerText={systemConfig.footer_text}
          logoUrl={systemConfig.logo_url}
          appName={systemConfig.app_name}
        >
          {activeAdminTab === 'dashboard' && <AdminDashboard employeeCount={employees.length} newsCount={newsList.length} />}
          {activeAdminTab === 'news' && <NewsList />}
          {activeAdminTab === 'carousel' && <CarouselList />}
          {activeAdminTab === 'announcements' && <AnnouncementList />}
          {activeAdminTab === 'employees' && <UserList />}
          {activeAdminTab === 'users' && <SystemUserList />}
          {activeAdminTab === 'roles' && <RoleList />}
          {activeAdminTab === 'tools' && <ToolList />}
          {activeAdminTab === 'app_permissions' && <AppPermissions />}
          {activeAdminTab === 'settings' && <SystemSettings />}
          {activeAdminTab === 'security' && <SecuritySettings />}
          {activeAdminTab === 'org' && <OrganizationList />}
          {activeAdminTab === 'business_logs' && <BusinessLogs />}
          {activeAdminTab === 'access_logs' && <AccessLogs />}
          {activeAdminTab === 'iam_audit_logs' && <IAMAuditLogs />}
          {activeAdminTab === 'ai_audit' && <AIAudit />}
          {activeAdminTab === 'log_forwarding' && <LogForwarding />}
          {activeAdminTab === 'log_storage' && <LogStorage />}
          {activeAdminTab === 'ai_models' && <ModelConfig />}
          {activeAdminTab === 'ai_security' && <SecurityPolicy />}
          {activeAdminTab === 'ai_settings' && <AISettings />}
          {activeAdminTab === 'ai_usage' && <ModelUsagePage />}
          {activeAdminTab === 'kb_manage' && <KnowledgeBase />}
          {activeAdminTab === 'todos' && <AdminTodoList />}
          {activeAdminTab === 'about_us' && <AboutUs />}
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
        {systemConfig.footer_text || '© 2025 侯钰熙. All Rights Reserved.'}
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
