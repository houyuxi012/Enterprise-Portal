import React, { useMemo, useState, useEffect } from 'react';
import {
  TrendingUp, Calendar, Clock, ChevronRight, BellRing, UserCheck, Quote,
  X, AlertTriangle, Utensils, Wrench, FileText, UserPlus, Cpu
} from 'lucide-react';
import ApiClient, { QuickToolDTO } from '../services/api';
import { NewsItem, Announcement } from '../types';
import { getIcon } from '../utils/iconMap';
import { DAILY_QUOTES, CAROUSEL_ITEMS } from '../constants'; // Keeping these static for now as requested

interface DashboardProps {
  onViewAll: () => void;
  currentUser?: any;
}

const Dashboard: React.FC<DashboardProps> = ({ onViewAll, currentUser }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAnnouncementsModalOpen, setIsAnnouncementsModalOpen] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return '夜深了';
    if (hour < 11) return '早上好';
    if (hour < 13) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }, []);

  const username = currentUser?.username || '用户';

  // Data State
  const [tools, setTools] = useState<QuickToolDTO[]>([]);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fetchedTools, fetchedNews, fetchedAnnouncements] = await Promise.all([
          ApiClient.getTools(),
          ApiClient.getNews(),
          ApiClient.getAnnouncements()
        ]);
        setTools(fetchedTools);
        setNewsList(fetchedNews);
        setAnnouncements(fetchedAnnouncements);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      }
    };
    fetchData();
  }, []);

  const quote = useMemo(() => {
    const day = new Date().getDate();
    return DAILY_QUOTES[day % DAILY_QUOTES.length];
  }, []);

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(new Date());
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % CAROUSEL_ITEMS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const getTagConfig = (tag: string) => {
    const configs: Record<string, { color: string, icon: React.ReactNode }> = {
      '美食': { color: 'orange', icon: <Utensils size={14} /> },
      '维护': { color: 'blue', icon: <Wrench size={14} /> },
      '行政': { color: 'emerald', icon: <FileText size={14} /> },
      '招聘': { color: 'purple', icon: <UserPlus size={14} /> },
      'IT': { color: 'rose', icon: <Cpu size={14} /> },
    };
    return configs[tag] || { color: 'blue', icon: <BellRing size={14} /> };
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

  const stats = useMemo(() => ({
    total: announcements.length,
    urgent: announcements.filter(a => a.is_urgent).length,
    today: 2
  }), [announcements]);

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
        <div className="flex -space-x-2">
          {[1, 2, 3].map(i => (
            <img key={i} src={`https://i.pravatar.cc/100?u=${i + 10}`} className="w-10 h-10 rounded-xl border-2 border-slate-50 dark:border-slate-900 shadow-md" />
          ))}
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-500">
            +12
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: <TrendingUp size={18} />, label: '全员活跃度', val: '92%', color: 'blue', desc: '比上周增长 4%' },
          { icon: <Calendar size={18} />, label: '今日会议', val: '04', color: 'purple', desc: '下一场：14:00 产品周会' },
          { icon: <Clock size={18} />, label: '工时完成', val: '32h', color: 'rose', desc: '剩余目标 8h' },
        ].map((stat, i) => (
          <div key={i} className="mica group p-4 rounded-3xl hover:scale-[1.02] transition-all duration-500 shadow-lg shadow-slate-200/40 dark:shadow-none border border-white/40">
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
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">常用应用</h2>
              <button onClick={onViewAll} className="p-2 mica rounded-full text-slate-400 hover:text-blue-600 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {tools.slice(0, 6).map((tool) => (
                <a
                  key={tool.id}
                  href={tool.url}
                  className="mica group p-5 rounded-[1.75rem] hover:bg-white dark:hover:bg-slate-800 transition-all duration-500 border border-white/50 shadow-lg shadow-slate-200/20 dark:shadow-none"
                >
                  <div className={`w-10 h-10 ${tool.color} rounded-xl flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform duration-500 rim-glow`}>
                    {getIcon(tool.icon_name, { size: 18 })}
                  </div>
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter block">{tool.name}</span>
                  <p className="text-[9px] text-slate-400 mt-1 font-medium">点击进入系统</p>
                </a>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-6">资讯动态</h2>
            <div className="space-y-4">
              {newsList.slice(0, 2).map((news) => (
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
                <h3 className="font-black text-[10px] uppercase tracking-widest">实时公告</h3>
              </div>
              <BellRing size={14} className="text-slate-400" />
            </div>
            <div className="p-3 space-y-1">
              {announcements.slice(0, 3).map((item) => (
                <div key={item.id} className="group p-4 rounded-2xl hover:bg-white dark:hover:bg-slate-700/50 transition-all cursor-pointer">
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${getTagStyles(item.color)}`}>
                      {item.tag}
                    </span>
                    <span className="text-[8px] text-slate-400 font-bold">{item.time}</span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 line-clamp-1">{item.title}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setIsAnnouncementsModalOpen(true)}
              className="w-full py-4 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors border-t border-slate-100 dark:border-slate-800"
            >
              展开公告
            </button>
          </div>

          <div className="relative group overflow-hidden mica rounded-[2rem] aspect-[16/10] shadow-xl border border-white/50">
            {CAROUSEL_ITEMS.map((item, idx) => (
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
              {CAROUSEL_ITEMS.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${idx === currentSlide ? 'bg-white w-4' : 'bg-white/40'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {isAnnouncementsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
            onClick={() => setIsAnnouncementsModalOpen(false)}
          />
          <div className="mica w-full max-w-lg max-h-[80vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-500 border border-white/10 ring-1 ring-white/20">
            <div className="relative pt-4 pb-10 px-6 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 overflow-hidden shrink-0">
              <div className="flex items-center justify-between z-10 relative">
                <h2 className="text-xl font-black text-white uppercase">企业公告</h2>
                <button onClick={() => setIsAnnouncementsModalOpen(false)}><X className="text-white" size={24} /></button>
              </div>
              <div className="absolute -bottom-5 left-0 right-0 px-6 flex justify-center z-20">
                <div className="flex items-center bg-white/10 backdrop-blur-3xl p-0.5 rounded-full border border-white/10 shadow-lg max-w-full overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setFilterTag(null)}
                    className={`px-5 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${!filterTag ? 'bg-white text-slate-900 shadow-sm' : 'text-white/60 hover:text-white'}`}
                  >
                    全部
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
                  <div key={item.id} className="mica p-4 rounded-[1.5rem] border border-white dark:border-white/5">
                    <h3 className="font-bold text-slate-900 dark:text-white">{item.title}</h3>
                    <p className="text-slate-600 dark:text-slate-400 text-sm">{item.content}</p>
                    {item.is_urgent && (
                      <span className="text-[7px] font-black text-rose-600 uppercase tracking-widest bg-rose-100/50 px-1.5 py-0.5 rounded-md ml-2">
                        紧急
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedNews && (
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
                  (此处主要展示摘要内容，实际详情内容可根据需求进一步扩展字段)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
