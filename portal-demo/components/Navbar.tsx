
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, Newspaper, Users, FolderOpen, Settings, LogOut, 
  Search, Bell, Grid, X, ArrowRight, Globe, Sparkles, Loader2,
  CheckCircle2, Info, AlertCircle, Clock, ChevronRight, ShieldCheck,
  FolderClosed, HelpCircle, User
} from 'lucide-react';
import { AppView, Notification } from '../types';
import { QUICK_TOOLS, MOCK_NEWS, MOCK_EMPLOYEES, MOCK_NOTIFICATIONS } from '../constants';
import { getAIResponse } from '../services/geminiService';

interface NavbarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  globalSearch: string;
  setGlobalSearch: (search: string) => void;
  onAskAI: (prompt: string) => void;
  isAdmin?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ currentView, setView, globalSearch, setGlobalSearch, onAskAI, isAdmin }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  const menuItems = useMemo(() => [
    { id: AppView.DASHBOARD, label: '概览', icon: <LayoutDashboard size={18} /> },
    { id: AppView.NEWS, label: '资讯', icon: <Newspaper size={18} /> },
    { id: AppView.DIRECTORY, label: '团队', icon: <Users size={18} /> },
    { id: AppView.RESOURCES, label: '资源', icon: <FolderClosed size={18} /> },
    { id: AppView.TOOLS, label: '工具', icon: <Grid size={18} /> },
  ], []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (globalSearch.trim()) {
      setIsSearchVisible(false);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-6 py-2 pointer-events-none">
      <nav className="mica pointer-events-auto h-14 max-w-7xl w-full rounded-full flex items-center px-4 justify-between shadow-[0_8px_30px_-10px_rgba(0,0,0,0.1)] transition-all">
        <div className="flex items-center space-x-2 lg:space-x-6 overflow-hidden">
          <div 
            className="flex items-center space-x-3 cursor-pointer group pr-4 border-r border-slate-200/50 dark:border-slate-700/50 shrink-0" 
            onClick={() => setView(AppView.DASHBOARD)}
          >
            <div className="w-8 h-8 lg:w-9 lg:h-9 mesh-gradient rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-500/30 group-hover:rotate-12 transition-transform duration-500">
              S
            </div>
            <span className="hidden xl:block font-black text-base text-slate-900 dark:text-white tracking-tighter whitespace-nowrap">ShiKu Home</span>
          </div>

          <div className="flex items-center space-x-1 lg:space-x-2 no-scrollbar">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`relative group flex items-center space-x-2 px-2.5 lg:px-3 py-1.5 rounded-full transition-all duration-500 text-[10px] font-black uppercase tracking-tight whitespace-nowrap ${
                  currentView === item.id 
                    ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-sm' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {/* Fix: Cast React.ReactElement to any to allow size property */}
                {React.cloneElement(item.icon as React.ReactElement<any>, { size: 16 })}
                <span className="hidden sm:block">{item.label}</span>
                {currentView === item.id && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-600 rounded-full"></div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-1 lg:space-x-2 ml-2 flex-1 justify-end relative">
          <form 
            onSubmit={handleSearchSubmit}
            className={`transition-all duration-500 flex items-center overflow-hidden h-9 bg-slate-100 dark:bg-white/5 rounded-full ${isSearchVisible ? 'flex-1 max-w-xs px-3 ring-2 ring-indigo-500/20' : 'w-9 ring-0'}`}
          >
             <button 
               type="button"
               onClick={() => {
                 setIsSearchVisible(!isSearchVisible);
                 if (!isSearchVisible) setTimeout(() => searchInputRef.current?.focus(), 100);
               }} 
               className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-colors shrink-0"
             >
               <Search size={16} />
             </button>
             <input 
               ref={searchInputRef}
               type="text" 
               value={globalSearch}
               onChange={(e) => setGlobalSearch(e.target.value)}
               placeholder="全局搜索..."
               className="bg-transparent border-none outline-none text-xs font-bold text-slate-900 dark:text-white w-full placeholder:text-slate-400"
             />
          </form>
          
          <div className="relative" ref={notificationRef}>
            <button 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors shrink-0 ${isNotificationsOpen ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'}`}
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-rose-500 rounded-full border border-white dark:border-slate-900 animate-pulse"></span>
              )}
            </button>
            
            {isNotificationsOpen && (
              <div className="absolute right-0 mt-4 w-[320px] mica rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-slate-100 dark:border-slate-800">
                 <div className="px-6 py-4 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white">系统消息通知</h4>
                    <span className="px-2 py-0.5 bg-rose-500 text-white text-[8px] font-black rounded-full">{unreadCount}</span>
                 </div>
                 <div className="max-h-[350px] overflow-y-auto no-scrollbar">
                    {notifications.map(n => (
                      <div key={n.id} className="p-4 hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-50 dark:border-white/5 transition-colors cursor-pointer group">
                         <div className="flex justify-between items-start mb-1">
                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-tight">{n.title}</span>
                            <span className="text-[8px] text-slate-400 font-bold">{n.time}</span>
                         </div>
                         <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{n.message}</p>
                      </div>
                    ))}
                 </div>
                 <button className="w-full py-3 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">标记全部已读</button>
              </div>
            )}
          </div>

          <div className="relative shrink-0" ref={dropdownRef}>
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className={`relative p-0.5 rounded-xl transition-all duration-500 hover:scale-105 active:scale-95 ${isAdmin ? 'bg-indigo-600/20 shadow-lg shadow-indigo-600/10' : 'bg-transparent'}`}
            >
              <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl overflow-hidden ring-2 ring-white/80 dark:ring-slate-900 shadow-sm relative z-10">
                 <img src="https://i.pravatar.cc/150?u=alex" alt="Alex" className="w-full h-full object-cover" />
              </div>
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-4 w-[280px] bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-slate-100 dark:border-slate-800 z-[100]">
                <div className={`h-24 relative overflow-hidden ${isAdmin ? 'bg-indigo-900' : 'bg-indigo-600'}`}>
                  <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                  {isAdmin && (
                    <div className="absolute top-4 left-6">
                      <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[7px] font-black text-white uppercase tracking-[0.2em] border border-white/20">Super Admin</span>
                    </div>
                  )}
                </div>
                
                <div className="px-6 pb-6 pt-0 relative">
                  <div className="relative -mt-10 mb-4 w-20 h-20">
                    <div className="w-20 h-20 rounded-[1.5rem] p-1 bg-white dark:bg-slate-900 shadow-2xl">
                      <img src="https://i.pravatar.cc/150?u=alex" className="w-full h-full rounded-2xl object-cover" />
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Alex Johnson</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product Design Lead</p>
                  </div>

                  {isAdmin && (
                    <button 
                      onClick={() => { setView(AppView.ADMIN); setIsProfileOpen(false); }}
                      className="w-full mb-4 flex items-center justify-between p-4 rounded-3xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 group"
                    >
                      <div className="flex items-center space-x-3">
                        <ShieldCheck size={18} className="group-hover:rotate-12 transition-transform" />
                        <div className="text-left">
                           <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">后台管理中心</p>
                           <p className="text-[7px] opacity-60 font-black tracking-widest leading-none">Management Center</p>
                        </div>
                      </div>
                      <ChevronRight size={14} />
                    </button>
                  )}

                  <div className="space-y-1">
                    {[
                      { id: AppView.PROFILE, label: '个人中心', icon: <User size={14} />, desc: '查看个人资料与活动' },
                      { id: AppView.ABOUT, label: '关于我们', icon: <HelpCircle size={14} />, desc: '公司愿景与发展历程' },
                      { id: AppView.SETTINGS, label: '偏好设置', icon: <Settings size={14} />, desc: '主题与显示设置' },
                      { id: 'logout', label: '退出登录', icon: <LogOut size={14} />, desc: '安全注销账号', color: 'text-rose-500' }
                    ].map((item, idx) => (
                      <button 
                        key={idx}
                        onClick={() => { if (item.id !== 'logout') setView(item.id as AppView); setIsProfileOpen(false); }}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                      >
                        <div className="flex items-center space-x-4">
                          <div className={`p-2 rounded-xl bg-slate-100 dark:bg-slate-800 ${item.color || 'text-slate-400'}`}>
                            {item.icon}
                          </div>
                          <div className="text-left">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">{item.label}</p>
                            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{item.desc}</p>
                          </div>
                        </div>
                        <ChevronRight size={12} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Navbar;
