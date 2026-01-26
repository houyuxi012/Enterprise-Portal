
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Newspaper, Users, FolderOpen, Settings, LogOut,
  Search, Bell, Grid, X, ArrowRight, Globe, Sparkles, Loader2,
  CheckCircle2, Info, AlertCircle, Clock, ChevronRight
} from 'lucide-react';
import { AppView, Notification } from '../types';
import { QUICK_TOOLS, MOCK_NEWS, MOCK_EMPLOYEES, MOCK_NOTIFICATIONS } from '../constants';
import ApiClient from '../services/api';

interface NavbarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  globalSearch: string;
  setGlobalSearch: (search: string) => void;
  onAskAI: (prompt: string) => void;
  onLogout?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ currentView, setView, globalSearch, setGlobalSearch, onAskAI, onLogout }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [showSearchPreview, setShowSearchPreview] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);

  const [aiPreviewAnswer, setAiPreviewAnswer] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPreviewRef = useRef<HTMLDivElement>(null);
  const aiSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  const menuItems = useMemo(() => [
    { id: AppView.DASHBOARD, label: '概览', icon: <LayoutDashboard size={18} /> },
    { id: AppView.NEWS, label: '资讯', icon: <Newspaper size={18} /> },
    { id: AppView.DIRECTORY, label: '团队', icon: <Users size={18} /> },
    { id: AppView.TOOLS, label: '工具', icon: <Grid size={18} /> },
  ], []);

  useEffect(() => {
    if (aiSearchTimeoutRef.current) clearTimeout(aiSearchTimeoutRef.current);
    if (!globalSearch.trim()) {
      setAiPreviewAnswer(null);
      return;
    }
    setIsAiLoading(true);
    aiSearchTimeoutRef.current = setTimeout(async () => {
      const prompt = `作为一个内网助手，请针对以下搜索词提供非常简短（50字以内）的预览回答：${globalSearch}`;
      try {
        const response = await ApiClient.chatAI(prompt);
        setAiPreviewAnswer(response);
      } catch (e) {
        setAiPreviewAnswer(null);
      }
      setIsAiLoading(false);
    }, 800);
    return () => {
      if (aiSearchTimeoutRef.current) clearTimeout(aiSearchTimeoutRef.current);
    };
  }, [globalSearch]);

  const previewResults = useMemo(() => {
    if (!globalSearch.trim()) return null;
    const s = globalSearch.toLowerCase();
    return {
      tools: QUICK_TOOLS.filter(t => t.name.toLowerCase().includes(s)).slice(0, 3),
      news: MOCK_NEWS.filter(n => n.title.toLowerCase().includes(s)).slice(0, 2),
      employees: MOCK_EMPLOYEES.filter(e => e.name.toLowerCase().includes(s)).slice(0, 3),
    };
  }, [globalSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (searchPreviewRef.current && !searchPreviewRef.current.contains(event.target as Node) && !searchInputRef.current?.contains(event.target as Node)) {
        setShowSearchPreview(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleViewAllSearch = () => {
    setView(AppView.SEARCH_RESULTS);
    setShowSearchPreview(false);
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="text-emerald-500" size={16} />;
      case 'warning': return <AlertCircle className="text-rose-500" size={16} />;
      case 'reminder': return <Clock className="text-amber-500" size={16} />;
      default: return <Info className="text-blue-500" size={16} />;
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-6 py-2 pointer-events-none">
      <nav className="mica pointer-events-auto h-14 max-w-7xl w-full rounded-full flex items-center px-4 justify-between shadow-[0_8px_30px_-10px_rgba(0,0,0,0.1)] transition-all">
        {/* Brand & Menu */}
        <div className="flex items-center space-x-2 lg:space-x-6 overflow-hidden">
          <div
            className="flex items-center space-x-3 cursor-pointer group pr-4 border-r border-slate-200/50 dark:border-slate-700/50 shrink-0"
            onClick={() => setView(AppView.DASHBOARD)}
          >
            <div className="w-8 h-8 lg:w-9 lg:h-9 mesh-gradient rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-500/30 group-hover:rotate-12 transition-transform duration-500">
              S
            </div>
            <span className="hidden xl:block font-black text-base text-slate-900 dark:text-white tracking-tighter whitespace-nowrap">ShiKu Home</span>
          </div>

          <div className="flex items-center space-x-1 lg:space-x-2 no-scrollbar">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`relative group flex items-center space-x-2 px-2.5 lg:px-3 py-1.5 rounded-full transition-all duration-500 text-[10px] font-black uppercase tracking-tight whitespace-nowrap ${currentView === item.id
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
              >
                {React.cloneElement(item.icon as React.ReactElement, { size: 16 })}
                <span className="hidden sm:block">{item.label}</span>
                {currentView === item.id && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full"></div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Utilities */}
        <div className="flex items-center space-x-1 lg:space-x-2 ml-2 flex-1 justify-end relative">
          <div className={`transition-all duration-500 flex items-center bg-slate-100 dark:bg-slate-800 rounded-full ${isSearchVisible ? 'flex-1 max-w-xs px-2' : 'w-9 bg-transparent'}`}>
            <button onClick={() => setIsSearchVisible(!isSearchVisible)} className="w-9 h-9 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-full transition-colors shrink-0">
              <Search size={16} />
            </button>
            <input
              ref={searchInputRef}
              className={`bg-transparent outline-none text-xs font-bold text-slate-700 dark:text-slate-200 ml-2 w-full ${isSearchVisible ? 'block' : 'hidden'}`}
              placeholder="搜索人、事、物..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleViewAllSearch()}
            />
          </div>

          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors shrink-0 ${isNotificationsOpen ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'}`}
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-rose-500 rounded-full border border-white dark:border-slate-900 animate-pulse"></span>
              )}
            </button>
          </div>

          {/* Profile Dropdown Trigger */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="relative p-0.5 rounded-xl transition-all duration-500 hover:scale-105 active:scale-95 bg-transparent"
            >
              <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl overflow-hidden ring-2 ring-white/80 dark:ring-slate-900 shadow-sm relative z-10">
                <img src="https://i.pravatar.cc/150?u=alex" alt="Alex" className="w-full h-full object-cover" />
              </div>
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-4 w-[280px] bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-slate-100 dark:border-slate-800 z-[100]">
                {/* Immersive Header */}
                <div className="h-24 relative overflow-hidden bg-blue-600">
                  <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                </div>

                {/* Profile Card Body */}
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

                  {/* Standard Menu Actions */}
                  <div className="space-y-1">
                    {[
                      { id: AppView.SETTINGS, label: '偏好设置', icon: <Settings size={14} />, desc: '主题与显示设置' },
                      { id: 'logout', label: '退出登录', icon: <LogOut size={14} />, desc: '安全注销账号', color: 'text-rose-500' }
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (item.id === 'logout') {
                            if (onLogout) onLogout();
                          } else {
                            setView(item.id as AppView);
                          }
                          setIsProfileOpen(false);
                        }}
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
