import React, { lazy } from 'react';
import { Mail, Monitor, Moon, Sun, Laptop, Sparkles, Languages } from 'lucide-react';
import { AppLanguage } from '../i18n';
import { AppView, Employee, NewsItem, QuickToolDTO, Todo } from '../types';
import ApiClient from '../services/api';
import { getColorClass } from '../utils/colorMap';
import { getIcon } from '../utils/iconMap';
import { hasAdminAccess } from '../utils/adminAccess';
import AvatarWithFallback from '../components/AvatarWithFallback';

const Dashboard = lazy(() => import('../components/Dashboard'));
const TodoList = lazy(() => import('../pages/app/Todos'));
const PortalSecurity = lazy(() => import('../pages/PortalSecurity'));

type ThemeMode = 'light' | 'dark' | 'system';

export type NewsCategoryCode = 'announcement' | 'activity' | 'policy' | 'culture';

export interface PortalRouterViewModel {
  globalSearch: string;
  activeAppCategory: string;
  setActiveAppCategory: (value: string) => void;
  activeNewsTab: string;
  setActiveNewsTab: (value: string) => void;
  tools: QuickToolDTO[];
  newsList: NewsItem[];
  employees: Employee[];
  filteredTools: QuickToolDTO[];
  filteredNews: NewsItem[];
  filteredTodos: Todo[];
  filteredEmployees: Employee[];
  searchAiInsight: string | null;
  isSearchAiLoading: boolean;
  licenseCustomerName: string;
  normalizeToolCategory: (value?: string) => string;
  normalizeNewsCategory: (value?: string) => NewsCategoryCode;
  renderToolCategoryLabel: (value: string) => string;
  newsCategoryCodes: readonly NewsCategoryCode[];
  newsCategoryLabelKeys: Record<NewsCategoryCode, string>;
}

interface PortalRouterManagerProps {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  currentUser: any;
  t: (key: string, options?: Record<string, any>) => string;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  currentLanguage: AppLanguage;
  handleLanguageChange: (lang: AppLanguage) => void;
  viewModel: PortalRouterViewModel;
  onEnterAdminMode: () => void;
}

const PortalRouterManager: React.FC<PortalRouterManagerProps> = ({
  currentView,
  setCurrentView,
  currentUser,
  t,
  themeMode,
  setThemeMode,
  currentLanguage,
  handleLanguageChange,
  viewModel,
  onEnterAdminMode,
}) => {
  const {
    globalSearch,
    activeAppCategory,
    setActiveAppCategory,
    activeNewsTab,
    setActiveNewsTab,
    tools,
    newsList,
    employees,
    filteredTools,
    filteredNews,
    filteredTodos,
    filteredEmployees,
    searchAiInsight,
    isSearchAiLoading,
    licenseCustomerName,
    normalizeToolCategory,
    normalizeNewsCategory,
    renderToolCategoryLabel,
    newsCategoryCodes,
    newsCategoryLabelKeys,
  } = viewModel;

  switch (currentView) {
    case AppView.DASHBOARD:
      return (
        <Dashboard
          onViewAll={() => setCurrentView(AppView.TOOLS)}
          onNavigateToDirectory={() => setCurrentView(AppView.DIRECTORY)}
          onNavigateToTodos={() => setCurrentView(AppView.TODOS)}
          employees={employees}
          currentUser={currentUser}
        />
      );
    case AppView.SETTINGS:
      return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('appRoot.settings.title')}</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">{t('appRoot.settings.subtitle')}</p>
          </div>
          {hasAdminAccess(currentUser) && (
            <div className="mica rounded-[2.5rem] p-8 shadow-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
              <h3 className="text-lg font-bold mb-4 text-blue-800 dark:text-blue-300">{t('appRoot.settings.adminZoneTitle')}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('appRoot.settings.adminZoneDesc')}</p>
              <button
                onClick={onEnterAdminMode}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/30"
              >
                {t('appRoot.settings.enterAdmin')}
              </button>
            </div>
          )}
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
    case AppView.TOOLS: {
      const appCategories = ['all', ...Array.from(new Set(tools.map((tool) => normalizeToolCategory(tool.category)).filter(Boolean)))];
      const tabFilteredTools = filteredTools.filter((tool) => (
        activeAppCategory === 'all' || normalizeToolCategory(tool.category) === activeAppCategory
      ));
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
            {tabFilteredTools.map((tool) => (
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
    }
    case AppView.NEWS: {
      const newsKeyword = String(globalSearch ?? '').toLowerCase();
      const newsTabs = [
        { value: 'all', label: t('common.status.all') },
        ...newsCategoryCodes.map((code) => ({
          value: code,
          label: t(newsCategoryLabelKeys[code]),
        })),
      ];
      const tabFilteredNews = newsList
        .filter((item) => activeNewsTab === 'all' || normalizeNewsCategory(item.category) === activeNewsTab)
        .filter((item) => (
          String(item?.title ?? '').toLowerCase().includes(newsKeyword) ||
          String(item?.summary ?? '').toLowerCase().includes(newsKeyword)
        ));
      return (
        <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('appRoot.news.title')}</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">{t('appRoot.news.subtitle', { customer: licenseCustomerName })}</p>
            </div>
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
            {tabFilteredNews.map((news) => {
              const categoryCode = normalizeNewsCategory(news.category);
              return (
                <div key={news.id} className="group bg-white dark:bg-slate-800 rounded-[1.5rem] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 flex flex-col h-full border border-slate-100 dark:border-slate-700/50">
                  <div className="relative h-40 overflow-hidden">
                    <img src={news.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <span className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-black text-white shadow-lg backdrop-blur-md ${categoryCode === 'announcement' ? 'bg-indigo-500/90' :
                      categoryCode === 'activity' ? 'bg-blue-500/90' :
                        categoryCode === 'policy' ? 'bg-rose-500/90' : 'bg-emerald-500/90'
                      }`}>
                      {t(newsCategoryLabelKeys[categoryCode])}
                    </span>
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center text-[10px] font-bold text-slate-400 mb-2 tracking-wide uppercase">
                      <span>{news.date}</span>
                      <span className="mx-2 text-slate-300">|</span>
                      <span>{news.author}</span>
                    </div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
                      {news.title}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed line-clamp-2 mb-4 flex-1">
                      {news.summary}
                    </p>
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
    }
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
                {filteredEmployees.map((emp) => (
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
                {filteredTools.map((tool) => (
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
                {filteredNews.map((news) => (
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
                {filteredEmployees.map((emp) => (
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
                {filteredTodos.map((todo) => (
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
    case AppView.SECURITY:
      return <PortalSecurity />;
    default:
      return <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest">{t('appRoot.comingSoon')}</div>;
  }
};

export default PortalRouterManager;
