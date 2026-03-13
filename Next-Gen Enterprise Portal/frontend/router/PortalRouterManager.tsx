import React, { lazy, useState } from 'react';
import { Mail, Monitor, Moon, Sun, Laptop, Sparkles, Languages, AppWindow, ArrowLeft, ArrowRight, Heart, Share2, Bookmark, Calendar, UserCheck, ChevronLeft, ChevronRight, LayoutGrid, List, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLanguage } from '../i18n';
import { AppView } from '../modules/portal/types/views';
import { Employee, NewsItem, QuickToolDTO, Todo } from '../types';
import ApiClient from '../services/api';
import type { User as AuthUser } from '../shared/services/auth';
import { moduleRouteRegistry } from '../app/router';
import { hasAdminAccess } from '@/shared/utils/adminAccess';
import { AvatarWithFallback } from '../shared/components';

const Dashboard = lazy(() => import('../modules/portal/components/Dashboard'));
const HolidayDetail = lazy(() => import('../modules/portal/components/HolidayDetail'));
const {
  meetings: MeetingsPage,
  todos: TodoList,
  processCenter: ProcessCenterPage,
  security: PortalSecurity,
} = moduleRouteRegistry.portal;

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
  currentUser: AuthUser | null;
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
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [selectedHoliday, setSelectedHoliday] = useState<any>(null);
  const [newsCarouselIndex, setNewsCarouselIndex] = useState(0);
  const [newsViewMode, setNewsViewMode] = useState<'grid' | 'list'>('grid');

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

  const getNewsTimestamp = (value: NewsItem) => {
    const timestamp = new Date(value.date).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  };

  const sortNewsByDateDesc = (items: NewsItem[]) => [...items].sort((a, b) => getNewsTimestamp(b) - getNewsTimestamp(a));

  const latestRankedNews = React.useMemo(
    () =>
      [...newsList].sort((a, b) => {
        const latestDelta = Number(Boolean(b.show_in_news_center_latest)) - Number(Boolean(a.show_in_news_center_latest));
        if (latestDelta !== 0) return latestDelta;
        return getNewsTimestamp(b) - getNewsTimestamp(a);
      }),
    [newsList],
  );

  const newsCenterCarouselItems = React.useMemo(
    () => sortNewsByDateDesc(newsList.filter((item) => item.show_in_news_center_carousel)).slice(0, 4),
    [newsList],
  );

  switch (currentView) {
    case AppView.DASHBOARD:
      return (
        <Dashboard
          onViewAll={() => setCurrentView(AppView.TOOLS)}
          onNavigateToNews={() => setCurrentView(AppView.NEWS)}
          onOpenNews={(news) => {
            setSelectedNews(news);
            setCurrentView(AppView.NEWS);
          }}
          onNavigateToDirectory={() => setCurrentView(AppView.DIRECTORY)}
          onNavigateToTodos={() => setCurrentView(AppView.TODOS)}
          onNavigateToProcessCenter={() => setCurrentView(AppView.PROCESS_CENTER)}
          onNavigateToMeetings={() => setCurrentView(AppView.MEETINGS)}
          onOpenHolidayDetail={(holidayInfo) => {
            const activityMode = holidayInfo?.activity_mode || 'off';
            if (activityMode === 'external' && holidayInfo?.activity_url) {
              window.open(holidayInfo.activity_url, '_blank', 'noopener,noreferrer');
              return;
            }
            if (activityMode === 'local') {
              setSelectedHoliday(holidayInfo);
              setCurrentView(AppView.HOLIDAY_DETAIL);
              return;
            }
            setSelectedHoliday(holidayInfo);
            setCurrentView(AppView.HOLIDAY_DETAIL);
          }}
          employees={employees}
          currentUser={currentUser}
        />
      );
    case AppView.HOLIDAY_DETAIL:
      return (
        <HolidayDetail
           holiday={selectedHoliday}
           onBack={() => {
             setSelectedHoliday(null);
             setCurrentView(AppView.DASHBOARD);
           }}
        />
      );
    case AppView.MEETINGS:
      return <MeetingsPage onBack={() => setCurrentView(AppView.DASHBOARD)} />;
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
      return (
        <div className="space-y-12 animate-in fade-in duration-700 slide-in-from-bottom-8">
          <div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('appRoot.tools.title')}</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">{t('appRoot.tools.subtitle')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4 lg:grid-cols-6">
            {filteredTools.map((tool) => (
              <a
                key={tool.id}
                href={tool.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  ApiClient.logBusinessAction({
                    action: 'APP_LAUNCH',
                    target: tool.name,
                    detail: `Launched tool: ${tool.name} (URL: ${tool.url})`
                  });
                }}
                className="group flex flex-col items-center rounded-organic p-8 mica shadow-xl shadow-slate-200/20 transition-all duration-500 hover:-translate-y-3 hover:bg-white dark:shadow-none dark:hover:bg-slate-800"
              >
                <div className="mb-6 flex h-16 w-16 items-center justify-center overflow-hidden rounded-organic bg-slate-100 text-slate-500 shadow-xl transition-transform duration-500 group-hover:scale-110 rim-glow dark:bg-slate-800 dark:text-slate-200">
                  {tool.image ? (
                    <img src={tool.image} alt={tool.name} className="w-full h-full object-cover" />
                  ) : (
                    <AppWindow size={32} />
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
      // — 新闻详情全页面视图 —
      if (selectedNews) {
        const detailCategoryCode = normalizeNewsCategory(selectedNews.category);
        return (
          <div className="mx-auto max-w-6xl animate-in fade-in slide-in-from-bottom-12 duration-1000 pb-20">
            {/* Navigation & Actions */}
            <div className="mb-8 flex items-center justify-between px-4">
              <button
                onClick={() => setSelectedNews(null)}
                className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-indigo-600"
              >
                <ArrowLeft size={16} />
                <span>{t('appRoot.news.backToList')}</span>
              </button>
              <div className="flex items-center space-x-4">
                <button className="p-2 mica border border-white/50 dark:border-white/5 rounded-xl text-slate-400 hover:text-rose-500 transition-colors">
                  <Heart size={18} />
                </button>
                <button className="p-2 mica border border-white/50 dark:border-white/5 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors">
                  <Bookmark size={18} />
                </button>
                <button className="p-2 mica border border-white/50 dark:border-white/5 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors">
                  <Share2 size={18} />
                </button>
              </div>
            </div>

            {/* Hero Section: Image and Title Integration */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 rounded-[3rem] overflow-hidden mica border border-white/50 dark:border-white/5 shadow-2xl mb-12">
              <div className="lg:col-span-10 p-10 lg:p-14 flex flex-col justify-center space-y-6">
                <div className="flex items-center space-x-3">
                  <span className={`px-4 py-1.5 text-white text-[9px] font-black rounded-full uppercase tracking-widest shadow-lg ${
                    detailCategoryCode === 'announcement' ? 'bg-indigo-600 shadow-indigo-600/20' :
                    detailCategoryCode === 'activity' ? 'bg-blue-600 shadow-blue-600/20' :
                    detailCategoryCode === 'policy' ? 'bg-rose-500 shadow-rose-500/20' : 'bg-emerald-600 shadow-emerald-600/20'
                  }`}>
                    {t(newsCategoryLabelKeys[detailCategoryCode])}
                  </span>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{selectedNews.date}</span>
                </div>
                <h1 className="text-3xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-[1.1]">
                  {selectedNews.title}
                </h1>
                <p className="text-base font-medium text-slate-500 dark:text-slate-400 leading-relaxed italic border-l-4 border-indigo-600 pl-6 py-1">
                  {selectedNews.summary}
                </p>
                <div className="flex items-center space-x-4 pt-2">
                  <img src={`https://i.pravatar.cc/150?u=${selectedNews.author}`} className="w-10 h-10 rounded-2xl object-cover ring-4 ring-white dark:ring-slate-800 shadow-lg" />
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white leading-none mb-1">{selectedNews.author}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{t('appRoot.news.byline', 'ShiKu Internal Newsroom')} · {t('appRoot.news.readTime', '5 min read')}</p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2 relative h-64 lg:h-auto">
                <img src={selectedNews.image} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent lg:from-transparent dark:from-slate-900/10"></div>
              </div>
            </div>

            {/* Content Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 px-4">
              {/* Main Content */}
              <div className="lg:col-span-8 space-y-12">
                <div className="mica p-10 lg:p-16 rounded-[3rem] border border-white/50 dark:border-white/5 shadow-xl">
                  <div className="prose prose-lg dark:prose-invert max-w-none 
                    prose-headings:font-black prose-headings:tracking-tight prose-headings:text-slate-900 dark:prose-headings:text-white
                    prose-p:font-medium prose-p:leading-relaxed prose-p:text-slate-600 dark:prose-p:text-slate-300
                    prose-strong:font-black prose-strong:text-indigo-600
                    prose-blockquote:border-l-indigo-600 prose-blockquote:bg-indigo-50/50 dark:prose-blockquote:bg-indigo-900/10 prose-blockquote:py-2 prose-blockquote:rounded-r-2xl
                    prose-img:rounded-[2rem] prose-img:shadow-2xl">
                    <h2>{selectedNews.title}</h2>
                    <p className="text-lg leading-relaxed font-medium text-slate-700 dark:text-slate-300 first-letter:text-5xl first-letter:font-black first-letter:float-left first-letter:mr-3 first-letter:mt-[-6px]">
                      {selectedNews.summary}
                    </p>
                    <p className="mt-6 text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t('appRoot.news.detailHint')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div className="lg:col-span-4 space-y-8">
                {/* Related News */}
                <div className="mica p-8 rounded-[2.5rem] border border-white/50 dark:border-white/5 shadow-xl">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">{t('appRoot.news.related', '相关推荐')}</h3>
                  <div className="space-y-6">
                    {newsList.filter(n => n.id !== selectedNews.id).slice(0, 3).map(newsItem => (
                      <div key={newsItem.id} onClick={() => setSelectedNews(newsItem)} className="group cursor-pointer flex space-x-4">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
                          <img src={newsItem.image || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&auto=format&fit=crop'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        </div>
                        <div className="flex flex-col justify-center">
                          <h4 className="text-sm font-black text-slate-900 dark:text-white line-clamp-2 group-hover:text-indigo-600 transition-colors leading-snug">{newsItem.title}</h4>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{newsItem.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div className="mica p-8 rounded-[2.5rem] border border-white/50 dark:border-white/5 shadow-xl">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">{t('appRoot.news.tags', '热门标签')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {['# NGEP', '# 办公升级', '# 企业文化', '# 效率提升', '# 团队协作'].map(tag => (
                      <span key={tag} className="px-3 py-1.5 bg-slate-50 dark:bg-white/5 border border-white dark:border-white/5 rounded-xl text-[10px] font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-600 transition-all cursor-pointer">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Newsletter */}
                <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl shadow-indigo-600/20 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                  <h3 className="text-xl font-black mb-2 relative z-10">{t('appRoot.news.newsletterTitle', '订阅周报')}</h3>
                  <p className="text-xs font-medium text-indigo-100 mb-6 relative z-10 opacity-80">{t('appRoot.news.newsletterDesc', '获取 NGEP 最新的资讯与动态，每周一准时送达。')}</p>
                  <div className="space-y-3 relative z-10">
                    <input type="email" placeholder="your@email.com" className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all" />
                    <button className="w-full bg-white text-indigo-600 text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all">{t('appRoot.news.newsletterBtn', '立即订阅')}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // — 新闻列表视图 —
      const newsKeyword = String(globalSearch ?? '').toLowerCase();
      const newsTabs = [
        { value: 'all', label: t('common.status.all') },
        ...newsCategoryCodes.map((code) => ({
          value: code,
          label: t(newsCategoryLabelKeys[code]),
        })),
      ];
      const tabFilteredNews = latestRankedNews
        .filter((item) => activeNewsTab === 'all' || normalizeNewsCategory(item.category) === activeNewsTab)
        .filter((item) => (
          String(item?.title ?? '').toLowerCase().includes(newsKeyword) ||
          String(item?.summary ?? '').toLowerCase().includes(newsKeyword)
        ));

      const carouselItems = newsCenterCarouselItems;
      const activeCarouselIndex = carouselItems.length > 0 ? newsCarouselIndex % carouselItems.length : 0;
      const activeCarouselItem = carouselItems[activeCarouselIndex];

      return (
        <div className="space-y-12 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
          {/* News Center Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">{t('appRoot.news.title')}</h1>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">ShiKu Home Intelligence & Insights</p>
            </div>
            <div className="flex bg-white/40 dark:bg-white/5 p-1.5 rounded-2xl border border-white/50 shadow-sm">
              {newsTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveNewsTab(tab.value)}
                  className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeNewsTab === tab.value
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main News Carousel */}
          {carouselItems.length > 0 && (
            <div className="relative h-[400px] lg:h-[500px] rounded-[3rem] overflow-hidden shadow-2xl group">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeCarouselIndex}
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.6, ease: "circOut" }}
                  className="absolute inset-0"
                >
                  <img
                    src={activeCarouselItem.image}
                    className="w-full h-full object-cover"
                    alt={activeCarouselItem.title}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>

                  <div className="absolute bottom-0 left-0 w-full p-10 lg:p-16 space-y-4">
                    <motion.span
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg inline-block"
                    >
                      {t(newsCategoryLabelKeys[normalizeNewsCategory(activeCarouselItem.category)])}
                    </motion.span>
                    <motion.h2
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-4xl lg:text-6xl font-black text-white tracking-tighter leading-none max-w-3xl"
                    >
                      {activeCarouselItem.title}
                    </motion.h2>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="flex items-center space-x-6 pt-4"
                    >
                      <button onClick={() => setSelectedNews(activeCarouselItem)} className="px-8 py-3 bg-white text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">
                        {t('appRoot.news.readMore')}
                      </button>
                      <button className="flex items-center space-x-2 text-white/80 hover:text-white transition-colors">
                        <Share2 size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest">{t('appRoot.news.share')}</span>
                      </button>
                    </motion.div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Carousel Controls & Indicators */}
              <div className="absolute bottom-10 right-10 flex items-center space-x-3 z-20">
                <button
                  onClick={() => setNewsCarouselIndex((prev) => (prev - 1 + carouselItems.length) % carouselItems.length)}
                  className="w-12 h-12 rounded-2xl mica border border-white/20 text-white flex items-center justify-center hover:bg-white hover:text-slate-900 transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setNewsCarouselIndex((prev) => (prev + 1) % carouselItems.length)}
                  className="w-12 h-12 rounded-2xl mica border border-white/20 text-white flex items-center justify-center hover:bg-white hover:text-slate-900 transition-all"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className="absolute top-10 right-10 flex space-x-2 z-20">
                {carouselItems.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setNewsCarouselIndex(i)}
                    className={`h-1.5 rounded-full transition-all duration-500 ${activeCarouselIndex === i ? 'w-8 bg-white' : 'w-2 bg-white/30'}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* News Grid Section */}
          <div className="space-y-8">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">最新动态 · Latest Updates</h3>
              <div className="flex items-center">
                <div className="flex items-center space-x-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10">
                  <button 
                    onClick={() => setNewsViewMode('grid')}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all ${newsViewMode === 'grid' ? 'bg-white dark:bg-white/10 shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <LayoutGrid size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">网格</span>
                  </button>
                  <button 
                    onClick={() => setNewsViewMode('list')}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all ${newsViewMode === 'list' ? 'bg-white dark:bg-white/10 shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <List size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">列表</span>
                  </button>
                </div>
              </div>
            </div>

            {newsViewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {tabFilteredNews.map((news) => {
                  const categoryCode = normalizeNewsCategory(news.category);
                  return (
                    <div
                      key={news.id}
                      onClick={() => setSelectedNews(news)}
                      className="mica group rounded-[2.5rem] overflow-hidden border border-white/50 shadow-xl flex flex-col hover:-translate-y-2 transition-all duration-500 cursor-pointer dark:border-slate-700/50 dark:bg-slate-800"
                    >
                      <div className="h-56 overflow-hidden relative">
                        <img src={news.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" loading="lazy" />
                        <div className="absolute top-4 left-4">
                          <span className="px-3 py-1 bg-white/20 backdrop-blur-md text-white text-[8px] font-black rounded-full uppercase tracking-widest border border-white/20">
                            {t(newsCategoryLabelKeys[categoryCode])}
                          </span>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                      <div className="p-8 flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-2">
                            <img src={`https://i.pravatar.cc/150?u=${news.author}`} className="w-6 h-6 rounded-lg object-cover" />
                            <span className="text-[10px] font-bold text-slate-400">{news.author}</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">{news.date}</span>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight mb-4 group-hover:text-indigo-600 transition-colors">{news.title}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-6 flex-1">{news.summary}</p>
                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-white/5">
                          <button className="flex items-center space-x-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest group-hover:translate-x-1 transition-transform duration-300">
                            <span>{t('appRoot.news.readMore')}</span>
                            <ChevronRight size={14} />
                          </button>
                          <div className="flex items-center space-x-3 text-slate-300">
                            <Heart size={14} />
                            <MessageSquare size={14} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {tabFilteredNews.map((news) => {
                  const categoryCode = normalizeNewsCategory(news.category);
                  return (
                    <div 
                      key={news.id} 
                      onClick={() => setSelectedNews(news)} 
                      className="mica group rounded-3xl overflow-hidden border border-white/50 shadow-lg flex items-center p-4 hover:bg-white/60 dark:hover:bg-white/10 transition-all duration-300 cursor-pointer dark:border-slate-700/50 dark:bg-slate-800"
                    >
                      <div className="w-40 h-28 rounded-2xl overflow-hidden flex-shrink-0">
                        <img src={news.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                      </div>
                      <div className="ml-6 flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className={`${
                            categoryCode === 'announcement' ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' :
                            categoryCode === 'activity' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' :
                            categoryCode === 'policy' ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/30' : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'
                          } text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full`}>
                            {t(newsCategoryLabelKeys[categoryCode])}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">{news.date}</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors line-clamp-1">{news.title}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-1">{news.summary}</p>
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center space-x-2">
                            <img src={`https://i.pravatar.cc/150?u=${news.author}`} className="w-5 h-5 rounded-full object-cover" />
                            <span className="text-[10px] font-bold text-slate-400">{news.author}</span>
                          </div>
                          <div className="flex items-center space-x-4 text-slate-300">
                             <div className="flex items-center space-x-1">
                               <Heart size={12} />
                               <span className="text-[9px] font-bold">{Math.floor(Math.random() * 50) + 1}</span>
                             </div>
                             <div className="flex items-center space-x-1">
                               <MessageSquare size={12} />
                               <span className="text-[9px] font-bold">{Math.floor(Math.random() * 20)}</span>
                             </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {tabFilteredNews.length === 0 && (
              <div className="text-center py-20 text-slate-400 font-bold">{t('appRoot.news.empty')}</div>
            )}
          </div>
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
                    <td className="px-8 py-4">
                      <a
                        href={emp.email ? `mailto:${emp.email}` : undefined}
                        className="inline-flex"
                        aria-label={`${t('appRoot.directory.actions')}: ${emp.name}`}
                      >
                        <Mail size={16} className="text-blue-600 cursor-pointer" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredEmployees.length === 0 && (
            <div className="text-center py-20 text-slate-400 font-bold">{t('appRoot.search.empty')}</div>
          )}
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
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col items-center p-6 mica rounded-3xl hover:bg-white dark:hover:bg-slate-800 hover:-translate-y-2 transition-all duration-500 shadow-lg"
                  >
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform overflow-hidden bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-200">
                      {tool.image ? (
                        <img src={tool.image} alt={tool.name} className="w-full h-full object-cover" />
                      ) : (
                        <AppWindow size={24} />
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
    case AppView.PROCESS_CENTER:
      return <ProcessCenterPage onOpenTodoCenter={() => setCurrentView(AppView.TODOS)} />;
    case AppView.SECURITY:
      return <PortalSecurity />;
    default:
      return <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest">{t('appRoot.comingSoon')}</div>;
  }
};

export default PortalRouterManager;
