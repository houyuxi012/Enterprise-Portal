
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Newspaper, Users, FolderOpen, Settings, LogOut,
  Search, Bell, Grid, Sparkles, Loader2,
  CheckCircle2, Info, AlertCircle, Clock, ChevronRight
} from 'lucide-react';
import { AppView, Notification } from '../types';
import { MOCK_NOTIFICATIONS } from '../constants';
import ApiClient from '../services/api';
import { hasAdminAccess } from '../utils/adminAccess';

interface NavbarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  globalSearch: string;
  setGlobalSearch: (search: string) => void;
  onAskAI: (prompt: string) => void;
  onLogout?: () => void;
  // Data for preview
  tools: any[];
  news: any[];
  employees: any[];
  currentUser: any;
  systemConfig?: Record<string, string>;
}

type SearchEngine = 'local' | 'google' | 'bing' | 'baidu';

const Navbar: React.FC<NavbarProps> = ({
  currentView, setView, globalSearch, setGlobalSearch, onAskAI, onLogout,
  tools, news, employees, currentUser, systemConfig
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [showSearchPreview, setShowSearchPreview] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);

  const [aiPreviewAnswer, setAiPreviewAnswer] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Cached logo URL to prevent flash on refresh
  const [logoUrl, setLogoUrl] = useState<string>(() => localStorage.getItem('sys_logo_url') || '/images/logo.png');

  // Sync logo URL with localStorage when systemConfig updates
  useEffect(() => {
    if (systemConfig?.logo_url) {
      setLogoUrl(systemConfig.logo_url);
      localStorage.setItem('sys_logo_url', systemConfig.logo_url);
    } else if (systemConfig && !systemConfig.logo_url) {
      // Config loaded but no custom logo - use default
      setLogoUrl('/images/logo.png');
      localStorage.removeItem('sys_logo_url');
    }
    // If systemConfig is undefined, keep using cached value (from localStorage)
  }, [systemConfig]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPreviewRef = useRef<HTMLDivElement>(null);
  /* SEARCH PREVIEW REF */
  // searchEngine state removed as we moved to distinct buttons in preview


  const handleSearchAction = () => {
    if (!globalSearch.trim()) return;
    // Default Enter key behavior: Always Local Search
    setView(AppView.SEARCH_RESULTS);
    setShowSearchPreview(false);
  };

  const openExternalSearch = (engine: 'google' | 'bing' | 'baidu') => {
    const urls = {
      google: 'https://www.google.com/search?q=',
      bing: 'https://www.bing.com/search?q=',
      baidu: 'https://www.baidu.com/s?wd='
    };
    window.open(`${urls[engine]}${encodeURIComponent(globalSearch)}`, '_blank');
    setShowSearchPreview(false);
  };

  const aiSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  const menuItems = useMemo(() => [
    { id: AppView.DASHBOARD, label: '概览', icon: <LayoutDashboard size={18} /> },
    { id: AppView.NEWS, label: '资讯', icon: <Newspaper size={18} /> },
    { id: AppView.DIRECTORY, label: '团队', icon: <Users size={18} /> },
    { id: AppView.TOOLS, label: '应用', icon: <Grid size={18} /> },
  ], []);

  useEffect(() => {
    if (aiSearchTimeoutRef.current) clearTimeout(aiSearchTimeoutRef.current);

    // Check config - skip if disabled
    if (!globalSearch.trim() || (systemConfig && systemConfig.search_ai_enabled === 'false')) {
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
  }, [globalSearch, systemConfig]);

  const previewResults = useMemo(() => {
    if (!globalSearch.trim()) return null;
    const s = globalSearch.toLowerCase();
    return {
      tools: tools.filter(t => t.name.toLowerCase().includes(s)).slice(0, 3),
      news: news.filter(n => n.title.toLowerCase().includes(s)).slice(0, 2),
      employees: employees.filter(e => e.name.toLowerCase().includes(s)).slice(0, 3),
    };
  }, [globalSearch, tools, news, employees]);

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

  // Default values if currentUser is unknown
  const username = currentUser?.username || '用户';
  const hasAdminIdentity = hasAdminAccess(currentUser);
  const userRole = hasAdminIdentity ? '管理员' : '普通用户';

  let userAvatar = currentUser?.avatar;
  if (!userAvatar) {
    if (hasAdminIdentity) {
      userAvatar = '/images/admin-avatar.svg';
    } else {
      userAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    }
  }





  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-6 py-2 pointer-events-none">
      <nav className="mica pointer-events-auto h-14 max-w-7xl w-full rounded-full flex items-center px-4 justify-between shadow-[0_8px_30px_-10px_rgba(0,0,0,0.1)] transition-all">
        {/* Brand & Menu */}
        <div className="flex items-center space-x-2 lg:space-x-6 overflow-hidden">
          <div
            className="flex items-center space-x-3 cursor-pointer group pr-4 border-r border-slate-200/50 dark:border-slate-700/50 shrink-0"
            onClick={() => setView(AppView.DASHBOARD)}
          >
            <img src={logoUrl} className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl object-cover group-hover:rotate-12 transition-transform duration-500" alt="Logo" />
            <span className="hidden xl:block font-black text-base text-slate-900 dark:text-white tracking-tighter whitespace-nowrap">
              {systemConfig?.app_name || 'Next-Gen Enterprise Portal'}
            </span>
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
                {React.cloneElement(item.icon as any, { size: 16 })}
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
          <div className={`relative transition-all duration-500 flex items-center bg-slate-100 dark:bg-slate-800 rounded-full ${isSearchVisible ? 'flex-1 max-w-xs px-1' : 'w-9 bg-transparent'}`}>

            <button onClick={() => isSearchVisible ? handleSearchAction() : setIsSearchVisible(!isSearchVisible)} className="w-9 h-9 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-full transition-colors shrink-0">
              <Search size={16} />
            </button>
            <input
              ref={searchInputRef}
              className={`bg-transparent outline-none text-xs font-bold text-slate-700 dark:text-slate-200 ml-2 w-full ${isSearchVisible ? 'block' : 'hidden'}`}
              placeholder="搜索人、事、物..."
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setShowSearchPreview(true);
              }}
              onFocus={() => {
                if (globalSearch.trim()) setShowSearchPreview(true);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchAction()}
            />

            {/* Search Preview Dropdown */}
            {isSearchVisible && showSearchPreview && globalSearch.trim() && (
              <div ref={searchPreviewRef} className="absolute top-12 left-0 w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden p-4 z-50 animate-in fade-in zoom-in-95">
                {/* AI Preview */}
                {isAiLoading ? (
                  <div className="flex items-center space-x-2 text-slate-400 text-xs mb-3 p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <Loader2 size={12} className="animate-spin" />
                    <span>AI 正在思考...</span>
                  </div>
                ) : aiPreviewAnswer && (
                  <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                    <div className="flex items-center space-x-2 mb-1 text-blue-600 dark:text-blue-400">
                      <Sparkles size={12} />
                      <span className="text-[10px] font-black uppercase tracking-wider">AI 助手</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{aiPreviewAnswer}</p>
                  </div>
                )}

                {/* Local Results */}
                {previewResults && (
                  <div className="space-y-3 mb-3">
                    {previewResults.tools.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">应用</h4>
                        {previewResults.tools.map((t: any) => (
                          <div key={t.id} className="flex items-center space-x-2 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                            <div className="w-5 h-5 rounded bg-white shadow-sm flex items-center justify-center text-xs">{t.icon_name ? <span>{t.icon_name[0]}</span> : <Grid size={10} />}</div>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* External Engines */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">全网搜索</h4>
                  <div className="space-y-1">
                    <button onClick={() => openExternalSearch('google')} className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-xs font-bold text-slate-600 dark:text-slate-300">
                      Google
                    </button>
                    <button onClick={() => openExternalSearch('bing')} className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-xs font-bold text-slate-600 dark:text-slate-300">
                      Bing
                    </button>
                    <button onClick={() => openExternalSearch('baidu')} className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-xs font-bold text-slate-600 dark:text-slate-300">
                      百度
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                <img src={userAvatar} alt={username} className="w-full h-full object-cover" />
              </div>
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-3 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800 z-[100]">
                {/* Compact Profile Header */}
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden ring-2 ring-slate-100 dark:ring-slate-700 shrink-0">
                      <img src={userAvatar} className="w-full h-full object-cover" alt={username} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{username}</h3>
                      <p className="text-[10px] font-medium text-slate-400">{userRole}</p>
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="py-2">
                  <button
                    onClick={() => {
                      setView(AppView.SETTINGS);
                      setIsProfileOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                  >
                    <Settings size={16} className="text-slate-400" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">偏好设置</span>
                  </button>
                  <button
                    onClick={() => {
                      if (onLogout) onLogout();
                      setIsProfileOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors text-left group"
                  >
                    <LogOut size={16} className="text-slate-400 group-hover:text-rose-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-rose-600">退出登录</span>
                  </button>
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
