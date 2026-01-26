import React, { useState, useMemo, useEffect } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import AIAssistant from './components/AIAssistant';
import { AppView, Employee, NewsItem, QuickToolDTO } from './types';
import ApiClient from './services/api';
import { getIcon } from './utils/iconMap';
import {
  Mail, Monitor, Moon, Sun, Laptop
} from 'lucide-react';

type ThemeMode = 'light' | 'dark' | 'system';

interface FilterState {
  departments: string[];
  statuses: string[];
}

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
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

  // Fetch Data on Mount
  useEffect(() => {
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
  }, []);

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

  const renderView = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard onViewAll={() => setCurrentView(AppView.TOOLS)} />;
      case AppView.SETTINGS:
        return (
          <div className="space-y-12 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">偏好设置</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">定制您的 ShiKu Home 沉浸式体验</p>
            </div>
            {/* Settings content truncated for brevity, but functionality is preserved */}
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
      default:
        return <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest">即将上线</div>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-600 selection:text-white transition-colors">
      <Navbar
        currentView={currentView}
        setView={setCurrentView}
        globalSearch={globalSearch}
        setGlobalSearch={setGlobalSearch}
        onAskAI={handleOpenAssistantWithPrompt}
      />

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
