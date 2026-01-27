import React, { useState, useMemo, useEffect } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import AIAssistant from './components/AIAssistant';
import { AppView, Employee, NewsItem, QuickToolDTO } from './types';
import ApiClient from './services/api';
import { getIcon } from './utils/iconMap';
import {
  Mail, Monitor, Moon, Sun, Laptop, Sparkles
} from 'lucide-react';

type ThemeMode = 'light' | 'dark' | 'system';

interface FilterState {
  departments: string[];
  statuses: string[];
}

import Login from './pages/Login';
import AuthService from './services/auth';

import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import NewsList from './pages/admin/NewsList';
import EmployeeList from './pages/admin/EmployeeList';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(AuthService.isAuthenticated());
  const [currentUser, setCurrentUser] = useState<any>(null);

  // View State
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminTab, setAdminTab] = useState<'dashboard' | 'news' | 'employees' | 'users'>('dashboard');

  const [globalSearch, setGlobalSearch] = useState('');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantInitialPrompt, setAssistantInitialPrompt] = useState('');

  // Data State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [tools, setTools] = useState<QuickToolDTO[]>([]);

  // Team Filter State
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterState>({
    departments: [],
    statuses: []
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

  useEffect(() => {
    // Check URL for admin
    if (window.location.pathname === '/admin') {
      if (isAuthenticated && currentUser?.role === 'admin') {
        setIsAdminMode(true);
      }
    }
  }, [isAuthenticated, currentUser]);

  useEffect(() => {
    if (isAuthenticated) {
      AuthService.getCurrentUser().then(user => {
        setCurrentUser(user);
        if (user.role === 'admin') {
          // Optional: Auto switch to admin mode or show option
        }
      }).catch(() => {
        setIsAuthenticated(false);
      });
    }
  }, [isAuthenticated]);

  // Fetch Data on Mount
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchData = async () => {
      try {
        const [fetchedEmployees, fetchedNews, fetchedTools] = await Promise.all([
          ApiClient.getEmployees(),
          ApiClient.getNews(),
          ApiClient.getTools()
        ]);
        setEmployees(fetchedEmployees);
        setNewsList(fetchedNews);
        setTools(fetchedTools);
      } catch (error) {
        console.error("Error fetching app data:", error);
      }
    };
    fetchData();
  }, [isAuthenticated]);

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
      const fetchInsight = async () => {
        setIsSearchAiLoading(true);
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
  }, [currentView, globalSearch]);

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
      const matchesStatus = activeFilters.statuses.length === 0 || activeFilters.statuses.includes(emp.status);

      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [globalSearch, activeFilters, employees]);

  const handleOpenAssistantWithPrompt = (prompt: string) => {
    setAssistantInitialPrompt(prompt);
    setIsAssistantOpen(true);
  };

  const handleLogout = () => {
    AuthService.logout();
    setIsAuthenticated(false);
  };

  const renderView = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard onViewAll={() => setCurrentView(AppView.TOOLS)} currentUser={currentUser} />;
      case AppView.SETTINGS:
        return (
          <div className="space-y-12 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">偏好设置</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">定制您的 ShiKu Home 沉浸式体验</p>
            </div>

            {/* Admin Entry Point */}
            {currentUser?.role === 'admin' && (
              <div className="mica rounded-[2.5rem] p-8 shadow-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
                <h3 className="text-lg font-bold mb-4 text-blue-800 dark:text-blue-300">管理员专区</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">您拥有管理员权限，可以进入后台管理系统。</p>
                <button
                  onClick={() => setIsAdminMode(true)}
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
                  className="group flex flex-col items-center p-8 mica rounded-organic hover:bg-white dark:hover:bg-slate-800 hover:-translate-y-3 transition-all duration-500 shadow-xl shadow-slate-200/20 dark:shadow-none"
                >
                  <div className={`w-16 h-16 ${tool.color} rounded-organic flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 transition-transform duration-500 rim-glow`}>
                    {getIcon(tool.icon_name, { size: 32 })}
                  </div>
                  <h3 className="text-sm font-black text-center text-slate-800 dark:text-slate-100 uppercase tracking-tighter">{tool.name}</h3>
                </a>
              ))}
            </div>
          </div>
        );
      case AppView.NEWS:
        return (
          <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">资讯动态</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredNews.map(news => (
                <div key={news.id} className="group mica rounded-[2rem] overflow-hidden shadow-xl hover:-translate-y-1.5 transition-all duration-500 border border-white/50">
                  <div className="relative h-44 overflow-hidden">
                    <img src={news.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                  </div>
                  <div className="p-5">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">{news.title}</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 text-xs leading-relaxed line-clamp-2">{news.summary}</p>
                  </div>
                </div>
              ))}
            </div>
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
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-200">相关工具</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {filteredTools.map(tool => (
                    <a
                      key={tool.id}
                      href={tool.url}
                      className="group flex flex-col items-center p-6 mica rounded-organic hover:bg-white dark:hover:bg-slate-800 hover:-translate-y-2 transition-all duration-500 shadow-lg"
                    >
                      <div className={`w-12 h-12 ${tool.color} rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                        {getIcon(tool.icon_name, { size: 24 })}
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
                      <img src={emp.avatar} className="w-12 h-12 rounded-full shadow-sm" />
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

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  if (isAdminMode) {
    return (
      <AdminLayout
        activeTab={adminTab}
        onTabChange={setAdminTab}
        onExit={() => {
          setIsAdminMode(false);
          window.history.pushState({}, '', '/');
        }}
      >
        {adminTab === 'dashboard' && <AdminDashboard employeeCount={employees.length} newsCount={newsList.length} />}
        {adminTab === 'news' && <NewsList />}
        {adminTab === 'employees' && <EmployeeList />}
      </AdminLayout>
    );
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-600 selection:text-white transition-colors">
      {isAuthenticated && (
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
        />
      )}
      <main className="flex-1 mt-24 px-6 sm:px-8 pb-16">
        <div className="max-w-7xl mx-auto">
          {renderView()}
        </div>
      </main>

      <AIAssistant
        isOpen={isAssistantOpen}
        setIsOpen={setIsAssistantOpen}
        initialPrompt={assistantInitialPrompt}
      />
    </div>
  );
};

export default App;
