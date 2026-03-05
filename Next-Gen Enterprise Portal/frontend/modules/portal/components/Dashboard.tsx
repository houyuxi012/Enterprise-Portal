import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Calendar, Clock, ChevronRight, BellRing, UserCheck, Quote,
  X, Utensils, Wrench, FileText, UserPlus, Cpu, ListTodo
} from 'lucide-react';
import TodoService from '@/shared/services/todos';
import ApiClient, { QuickToolDTO } from '@/shared/services/api';
import { NewsItem, Announcement, CarouselItem, Employee } from '@/types';
import { getIcon } from '@/shared/utils/iconMap';
import { getColorClass } from '@/shared/utils/colorMap';
import { DAILY_QUOTES } from '@/shared/utils/constants';

interface DashboardProps {
  onViewAll: () => void;
  onNavigateToDirectory?: () => void;
  onNavigateToTodos?: () => void;
  employees?: Employee[];
  currentUser?: any;
}

const Dashboard: React.FC<DashboardProps> = ({ onViewAll, onNavigateToDirectory, onNavigateToTodos, employees = [], currentUser }) => {
  const { t, i18n } = useTranslation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAnnouncementsModalOpen, setIsAnnouncementsModalOpen] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);


  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return t('dashboardHome.greeting.lateNight');
    if (hour < 11) return t('dashboardHome.greeting.morning');
    if (hour < 13) return t('dashboardHome.greeting.noon');
    if (hour < 18) return t('dashboardHome.greeting.afternoon');
    return t('dashboardHome.greeting.evening');
  }, [t]);

  const username = currentUser?.username || t('dashboardHome.userFallback');
  const [todoStats, setTodoStats] = useState({ total: 0, emergency: 0, high: 0, medium: 0, low: 0, unclassified: 0 });
  // Data State
  const [tools, setTools] = useState<QuickToolDTO[]>([]);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<Set<number>>(new Set());
  const [carouselItems, setCarouselItems] = useState<CarouselItem[]>([]);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  const formatAnnouncementTime = (createdAt?: string, fallback?: string) => {
    if (!createdAt) return fallback || '-';
    const ts = new Date(createdAt).getTime();
    if (Number.isNaN(ts)) return fallback || '-';
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    if (diffMin <= 1) return t('dashboardHome.time.justNow');
    if (diffMin < 60) return t('dashboardHome.time.minutesAgo', { count: diffMin });
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return t('dashboardHome.time.hoursAgo', { count: diffHour });
    const diffDay = Math.floor(diffHour / 24);
    return t('dashboardHome.time.daysAgo', { count: diffDay });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [
          fetchedTools,
          fetchedNews,
          fetchedAnnouncements,
          fetchedCarousel,
          todoStatsData,
          readAnnouncementIdsData
        ] = await Promise.all([
          ApiClient.getTools(),
          ApiClient.getNews(),
          ApiClient.getAnnouncements(),
          ApiClient.getCarouselItems(),
          TodoService.getMyTaskStats('active'),
          ApiClient.getAnnouncementReadState()
        ]);
        setTools(fetchedTools);
        setNewsList(fetchedNews);
        setAnnouncements(fetchedAnnouncements);
        setCarouselItems(fetchedCarousel);
        setReadAnnouncementIds(new Set((readAnnouncementIdsData || []).map((id) => Number(id)).filter((id) => Number.isFinite(id))));
        setTodoStats({
          total: todoStatsData.total,
          emergency: todoStatsData.emergency,
          high: todoStatsData.high,
          medium: todoStatsData.medium,
          low: todoStatsData.low,
          unclassified: todoStatsData.unclassified,
        });
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      }
    };
    fetchData();
  }, []);

  const quote = useMemo(() => {
    const day = new Date().getDate();
    const quoteKey = DAILY_QUOTES[day % DAILY_QUOTES.length];
    return t(quoteKey);
  }, [t]);

  const formattedDate = useMemo(() => {
    const locale = i18n.resolvedLanguage?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(new Date());
  }, [i18n.resolvedLanguage]);

  useEffect(() => {
    if (carouselItems.length === 0) return;
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % carouselItems.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [carouselItems]);

  const getAliasList = (key: string): string[] => {
    const aliases = t(key, { returnObjects: true }) as unknown;
    if (!Array.isArray(aliases)) return [];
    return aliases.map((item) => String(item).toLowerCase());
  };

  const tagConfigList = useMemo(() => [
    { aliases: getAliasList('dashboardHome.tagAliases.food'), color: 'orange', icon: <Utensils size={14} /> },
    { aliases: getAliasList('dashboardHome.tagAliases.maintenance'), color: 'blue', icon: <Wrench size={14} /> },
    { aliases: getAliasList('dashboardHome.tagAliases.administration'), color: 'emerald', icon: <FileText size={14} /> },
    { aliases: getAliasList('dashboardHome.tagAliases.recruitment'), color: 'purple', icon: <UserPlus size={14} /> },
    { aliases: getAliasList('dashboardHome.tagAliases.it'), color: 'rose', icon: <Cpu size={14} /> },
  ], [t]);

  const getTagConfig = (tag: string) => {
    const normalized = (tag || '').toLowerCase();
    return tagConfigList.find((item) => item.aliases.includes(normalized)) || { color: 'blue', icon: <BellRing size={14} /> };
  };

  const getTagStyles = (color: string) => {
    const styles: Record<string, string> = {
      orange: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800/30',
      blue: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/30',
      rose: 'text-rose-600 bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/30',
      emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30',
      purple: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800/30',
    };
    return styles[color] || styles.blue;
  };

  const filteredAnnouncements = useMemo(() => {
    if (!filterTag) return announcements;
    return announcements.filter(a => a.tag === filterTag);
  }, [filterTag, announcements]);

  const uniqueTags = useMemo(() => {
    return Array.from(new Set(announcements.map(a => a.tag)));
  }, [announcements]);

  const hasUrgentAnnouncements = useMemo(
    () => announcements.some((a) => a.is_urgent),
    [announcements]
  );

  const handleAnnouncementRead = async (announcementId: string) => {
    const numericId = Number(announcementId);
    if (!Number.isFinite(numericId)) return;
    const wasRead = readAnnouncementIds.has(numericId);
    if (!wasRead) {
      setReadAnnouncementIds((prev) => {
        const next = new Set(prev);
        next.add(numericId);
        return next;
      });
    }
    try {
      await ApiClient.markAnnouncementsRead([numericId]);
    } catch (error) {
      if (!wasRead) {
        setReadAnnouncementIds((prev) => {
          const next = new Set(prev);
          next.delete(numericId);
          return next;
        });
      }
      console.error('Failed to mark announcement as read', error);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-1000 pt-2 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-slate-900 dark:text-white leading-none">
            {greeting}，{username}
          </h1>
          <div className="flex items-center mt-2 group">
            <Quote size={12} className="text-blue-500 mr-2 flex-shrink-0" />
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium italic tracking-tight">
              {quote} <span className="mx-2 text-slate-300 dark:text-slate-700">|</span> {formattedDate}
            </p>
          </div>
        </div>
        <div className="flex -space-x-2 items-center">
          {employees.slice(0, 4).map((emp, i) => (
            <img
              key={emp.id || i}
              src={emp.avatar || '/images/default-avatar.svg'}
              alt={emp.name}
              className="w-10 h-10 rounded-xl border-2 border-slate-50 dark:border-slate-900 shadow-md object-cover"
            />
          ))}
          {employees.length > 4 && (
            <button
              onClick={() => onNavigateToDirectory?.()}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-500 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
            >
              +{employees.length - 4}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: <ListTodo size={18} />,
            label: t('dashboardHome.cards.todo.label'),
            val: todoStats.total.toString(),
            color: 'orange',
            desc: t('dashboardHome.cards.todo.desc', {
              emergency: todoStats.emergency,
              high: todoStats.high,
              medium: todoStats.medium,
              low: todoStats.low,
              unclassifiedPart: todoStats.unclassified > 0
                ? t('dashboardHome.cards.todo.unclassifiedPart', { count: todoStats.unclassified })
                : ''
            }),
            onClick: onNavigateToTodos
          },
          {
            icon: <Calendar size={18} />,
            label: t('dashboardHome.cards.meeting.label'),
            val: t('dashboardHome.cards.meeting.value', { count: 4 }),
            color: 'purple',
            desc: t('dashboardHome.cards.meeting.desc')
          },
          {
            icon: <Clock size={18} />,
            label: t('dashboardHome.cards.workHours.label'),
            val: t('dashboardHome.cards.workHours.value'),
            color: 'rose',
            desc: t('dashboardHome.cards.workHours.desc')
          },
        ].map((stat, i: number) => (
          <div
            key={i}
            onClick={stat.onClick}
            className={`mica group p-4 rounded-3xl hover:scale-[1.02] transition-all duration-500 shadow-lg shadow-slate-200/40 dark:shadow-none border border-white/40 ${stat.onClick ? 'cursor-pointer' : ''}`}
          >
            <div className={`w-9 h-9 bg-${stat.color}-500/10 dark:bg-${stat.color}-500/20 text-${stat.color}-600 dark:text-${stat.color}-400 rounded-xl flex items-center justify-center mb-3 rim-glow group-hover:rotate-6 transition-transform`}>
              {stat.icon}
            </div>
            <h3 className="text-[8px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-0.5">{stat.label}</h3>
            <div className="flex items-baseline space-x-1">
              <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{stat.val}</span>
            </div>
            <p className="text-[8px] font-bold text-slate-400 mt-1">{stat.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-10">
          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">{t('dashboardHome.sections.commonApps')}</h2>
              <button onClick={onViewAll} className="p-2 mica rounded-full text-slate-400 hover:text-blue-600 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {tools.slice(0, 6).map((tool) => (
                <a
                  key={tool.id}
                  href={tool.url}
                  target="_blank"
                  className="mica group p-5 rounded-[1.75rem] hover:bg-white dark:hover:bg-slate-800 transition-all duration-500 border border-white/50 shadow-lg shadow-slate-200/20 dark:shadow-none"
                >
                  <div className={`w-10 h-10 ${!tool.image ? getColorClass(tool.color) : 'bg-white'} rounded-xl flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform duration-500 rim-glow overflow-hidden bg-white`}>
                    {tool.image ? (
                      <img src={tool.image} alt={tool.name} className="w-full h-full object-cover" />
                    ) : (
                      getIcon(tool.icon_name, { size: 18 })
                    )}
                  </div>
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter block">{tool.name}</span>
                  <p className="text-[9px] text-slate-400 mt-1 font-medium truncate">{tool.description || t('dashboardHome.sections.clickToEnter')}</p>
                </a>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-6">{t('dashboardHome.sections.news')}</h2>
            <div className="space-y-4">
              {newsList.slice(0, 3).map((news) => (
                <div
                  key={news.id}
                  onClick={() => setSelectedNews(news)}
                  className="mica group p-4 rounded-[1.75rem] hover:bg-white dark:hover:bg-slate-800 flex flex-col sm:flex-row gap-6 transition-all duration-700 cursor-pointer shadow-sm"
                >
                  <div className="sm:w-40 h-24 rounded-2xl overflow-hidden shrink-0">
                    <img src={news.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="text-[8px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                        {news.category}
                      </span>
                      <span className="text-[8px] text-slate-400 font-bold">{news.date}</span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight mb-1 group-hover:text-blue-600 transition-colors">
                      {news.title}
                    </h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">{news.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="mica rounded-[2rem] shadow-xl overflow-hidden border border-white/50">
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white/30">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></div>
                <h3 className="font-black text-[10px] uppercase tracking-widest">{t('dashboardHome.sections.announcements')}</h3>
              </div>
              <BellRing
                size={14}
                className={hasUrgentAnnouncements ? 'text-rose-500 animate-bell-shake' : 'text-slate-400'}
              />
            </div>
            <div className="p-3 space-y-1">
              {announcements.slice(0, 3).map((item) => (
                (() => {
                  const isRead = readAnnouncementIds.has(Number(item.id));
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleAnnouncementRead(item.id)}
                      className={`group p-4 rounded-2xl hover:bg-white dark:hover:bg-slate-700/50 transition-all cursor-pointer ${isRead ? 'opacity-70' : ''}`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${getTagStyles(item.color)}`}>
                            {item.tag}
                          </span>
                          {item.is_urgent && (
                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border text-rose-600 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/40">
                              {t('dashboardHome.status.urgent')}
                            </span>
                          )}
                          {isRead && (
                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                              {t('dashboardHome.status.read')}
                            </span>
                          )}
                        </div>
                        <span className="text-[8px] text-slate-400 font-bold">{formatAnnouncementTime(item.created_at, item.time)}</span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 line-clamp-1">{item.title}</p>
                    </div>
                  );
                })()
              ))}
            </div>
            <button
              onClick={() => setIsAnnouncementsModalOpen(true)}
              className="w-full py-4 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors border-t border-slate-100 dark:border-slate-800"
            >
              {t('dashboardHome.actions.expandAnnouncements')}
            </button>
          </div>

          <div className="relative group overflow-hidden mica rounded-[2rem] aspect-[16/10] shadow-xl border border-white/50">
            {carouselItems.length > 0 ? (
              <>
                {carouselItems.map((item, idx) => (
                  <a
                    key={item.id}
                    href={item.url}
                    className={`absolute inset-0 transition-all duration-1000 ease-in-out ${idx === currentSlide ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}`}
                  >
                    <img src={item.image} className="w-full h-full object-cover" alt={item.title} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6">
                      <span className="text-[8px] font-black uppercase tracking-widest bg-blue-600 text-white px-2 py-0.5 rounded-full w-fit mb-2">
                        {item.badge}
                      </span>
                      <h3 className="text-white font-black text-base leading-tight tracking-tight drop-shadow-md">
                        {item.title}
                      </h3>
                    </div>
                  </a>
                ))}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-1.5 z-20">
                  {carouselItems.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlide(idx)}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${idx === currentSlide ? 'bg-white w-4' : 'bg-white/40'}`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 font-bold">{t('dashboardHome.states.noCarousel')}</div>
            )}
          </div>
        </div>
      </div>

      {
        isAnnouncementsModalOpen && typeof document !== 'undefined' && createPortal((
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
            <div
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
              onClick={() => setIsAnnouncementsModalOpen(false)}
            />
            <div className="mica w-full max-w-lg max-h-[80vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-500 border border-white/10 ring-1 ring-white/20">
              <div className="relative pt-4 pb-10 px-6 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 shrink-0">
                <div className="flex items-center justify-between z-10 relative">
                  <h2 className="text-xl font-black text-white uppercase">{t('dashboardHome.modal.announcementTitle')}</h2>
                  <button onClick={() => setIsAnnouncementsModalOpen(false)}><X className="text-white" size={24} /></button>
                </div>
                <div className="absolute bottom-1 left-0 right-0 px-6 flex justify-center z-20">
                  <div className="flex items-center bg-white/10 backdrop-blur-3xl p-0.5 rounded-full border border-white/10 shadow-lg max-w-full overflow-x-auto no-scrollbar">
                    <button
                      onClick={() => setFilterTag(null)}
                      className={`px-5 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${!filterTag ? 'bg-white text-slate-900 shadow-sm' : 'text-white/60 hover:text-white'}`}
                    >
                      {t('dashboardHome.filters.all')}
                    </button>
                    {uniqueTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => setFilterTag(tag)}
                        className={`px-5 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterTag === tag ? 'bg-white text-slate-900 shadow-sm' : 'text-white/60 hover:text-white'}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pt-8 pb-8 px-6 no-scrollbar relative bg-slate-50/50 dark:bg-black/40">
                <div className="space-y-6">
                  {filteredAnnouncements.map((item) => (
                    (() => {
                      const isRead = readAnnouncementIds.has(Number(item.id));
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleAnnouncementRead(item.id)}
                          className={`mica p-4 rounded-[1.5rem] border border-white dark:border-white/5 cursor-pointer ${isRead ? 'opacity-70' : ''}`}
                        >
                          <h3 className="font-bold text-slate-900 dark:text-white">{item.title}</h3>
                          <p className="text-slate-600 dark:text-slate-400 text-sm">{item.content}</p>
                          <div className="mt-2 flex items-center gap-2">
                            {item.is_urgent && (
                              <span className="text-[7px] font-black text-rose-600 uppercase tracking-widest bg-rose-100/50 px-1.5 py-0.5 rounded-md">
                                {t('dashboardHome.status.urgent')}
                              </span>
                            )}
                            {isRead && (
                              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                                {t('dashboardHome.status.read')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ))}
                </div>
              </div>
            </div>
          </div>
        ), document.body)
      }

      {
        selectedNews && typeof document !== 'undefined' && createPortal((
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
            <div
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
              onClick={() => setSelectedNews(null)}
            />
            <div className="mica w-full max-w-2xl max-h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 border border-white/10 ring-1 ring-white/20">
              <div className="relative h-64 shrink-0">
                <img src={selectedNews.image} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <button
                  onClick={() => setSelectedNews(null)}
                  className="absolute top-6 right-6 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-md transition"
                >
                  <X size={24} />
                </button>
                <div className="absolute bottom-6 left-8 right-8">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-blue-600 text-white px-2.5 py-1 rounded-full mb-3 inline-block shadow-lg shadow-blue-900/50">
                    {selectedNews.category}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight drop-shadow-md">{selectedNews.title}</h2>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-white dark:bg-slate-900">
                <div className="flex items-center space-x-4 mb-6 text-xs text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center"><Calendar size={14} className="mr-2" /> {selectedNews.date}</div>
                  <div className="flex items-center"><UserCheck size={14} className="mr-2" /> {selectedNews.author}</div>
                </div>
                <div className="prose prose-slate dark:prose-invert max-w-none">
                  <p className="text-lg leading-relaxed font-medium text-slate-700 dark:text-slate-300 first-letter:text-5xl first-letter:font-black first-letter:float-left first-letter:mr-3 first-letter:mt-[-6px]">
                    {selectedNews.summary}
                  </p>
                  <p className="mt-6 text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t('dashboardHome.newsDetail.summaryHint')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ), document.body)
      }
    </div >
  );
};

export default Dashboard;
