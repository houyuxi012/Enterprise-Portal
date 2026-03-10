
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Newspaper, Users, FolderOpen, Settings, LogOut,
  Search, Bell, Grid, Sparkles, Loader2,
  CheckCircle2, Info, AlertCircle, Clock, ChevronRight
} from 'lucide-react';
import { KeyOutlined } from '@ant-design/icons';
import { AppView, type PortalPrimaryNavView } from '@/modules/portal/types/views';
import { Employee, NewsItem, Notification, QuickToolDTO } from '@/types';
import ApiClient from '@/shared/services/api';
import type { User as AuthUser } from '@/shared/services/auth';
import { hasAdminAccess } from '@/shared/utils/adminAccess';
import ChangePasswordModal from '@/shared/components/ChangePasswordModal';
import { useTranslation } from 'react-i18next';

interface NavbarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  globalSearch: string;
  setGlobalSearch: (search: string) => void;
  onAskAI: (prompt: string) => void;
  onLogout?: () => void;
  // Data for preview
  tools: QuickToolDTO[];
  news: NewsItem[];
  employees: Employee[];
  currentUser: AuthUser | null;
  systemConfig?: Record<string, string>;
}

type SearchEngine = 'local' | 'google' | 'bing' | 'baidu';

const Navbar: React.FC<NavbarProps> = ({
  currentView, setView, globalSearch, setGlobalSearch, onAskAI, onLogout,
  tools, news, employees, currentUser, systemConfig
}) => {
  const { t } = useTranslation();

  const formatRelativeTime = (value?: string): string => {
    if (!value) return t('navbar.time.justNow');
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return value;
    const diffMs = Date.now() - ts;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin <= 1) return t('navbar.time.justNow');
    if (diffMin < 60) return t('navbar.time.minutesAgo', { count: diffMin });
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return t('navbar.time.hoursAgo', { count: diffHour });
    const diffDay = Math.floor(diffHour / 24);
    return t('navbar.time.daysAgo', { count: diffDay });
  };

  const parseBackendNotificationId = (id: string): number | null => {
    if (!id.startsWith('notification-')) return null;
    const numeric = Number(id.slice('notification-'.length));
    return Number.isFinite(numeric) ? numeric : null;
  };

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [showSearchPreview, setShowSearchPreview] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const persistReadStates = (notes: Notification[]) => {
    if (!currentUser?.id) return;
    // Only persist local (non-backend) notification read states.
    const readIds = notes
      .filter(n => n.isRead && parseBackendNotificationId(n.id) === null)
      .map(n => n.id);
    localStorage.setItem(`read_notifications_${currentUser.id}`, JSON.stringify(readIds));
  };

  useEffect(() => {
    let cancelled = false;
    const refreshNotifications = async () => {
      if (!currentUser?.id) {
        setNotifications([]);
        return;
      }

      const localReadIds = new Set<string>();
      try {
        const readIds = JSON.parse(localStorage.getItem(`read_notifications_${currentUser.id}`) || '[]');
        if (Array.isArray(readIds)) {
          readIds.forEach((id) => localReadIds.add(String(id)));
        }
      } catch (e) {
        console.error('Failed to parse read notifications', e);
      }

      const backendNotifications: Notification[] = [];
      try {
        const rows = await ApiClient.getMyNotifications({ limit: 20, offset: 0 });
        rows.forEach((item) => {
          const type = ['info', 'success', 'warning', 'reminder'].includes(item.type) ? item.type : 'info';
          backendNotifications.push({
            id: `notification-${item.id}`,
            title: item.title,
            message: item.message,
            time: formatRelativeTime(item.created_at),
            type: type as Notification['type'],
            isRead: Boolean(item.is_read),
            actionUrl: item.action_url || undefined,
          });
        });
      } catch (e) {
        console.error('Failed to load notifications', e);
      }

      let nextNotifications = backendNotifications;

      if (currentUser?.password_violates_policy) {
        nextNotifications = [
          {
            id: 'weak-password-warning',
            title: t('navbar.weakPassword.title'),
            message: t('navbar.weakPassword.message'),
            time: t('navbar.time.justNow'),
            type: 'warning',
            isRead: localReadIds.has('weak-password-warning'),
          },
          ...nextNotifications,
        ];
      }

      if (!cancelled) {
        setNotifications(nextNotifications);
      }
    };

    refreshNotifications();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.password_violates_policy, t]);

  const [aiPreviewAnswer, setAiPreviewAnswer] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);

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

  const menuItems = useMemo<ReadonlyArray<{ id: PortalPrimaryNavView; label: string; icon: React.ReactNode }>>(() => [
    { id: AppView.DASHBOARD, label: t('navbar.menu.overview'), icon: <LayoutDashboard size={18} /> },
    { id: AppView.NEWS, label: t('navbar.menu.news'), icon: <Newspaper size={18} /> },
    { id: AppView.DIRECTORY, label: t('navbar.menu.team'), icon: <Users size={18} /> },
    { id: AppView.TOOLS, label: t('navbar.menu.apps'), icon: <Grid size={18} /> },
  ], [t]);

  useEffect(() => {
    if (aiSearchTimeoutRef.current) clearTimeout(aiSearchTimeoutRef.current);

    // Check config - skip if disabled
    if (!globalSearch.trim() || (systemConfig && systemConfig.search_ai_enabled === 'false')) {
      setAiPreviewAnswer(null);
      return;
    }

    setIsAiLoading(true);
    aiSearchTimeoutRef.current = setTimeout(async () => {
      const prompt = t('navbar.search.aiPrompt', { query: globalSearch });
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
  }, [globalSearch, systemConfig, t]);

  const previewResults = useMemo(() => {
    if (!globalSearch.trim()) return null;
    const normalize = (value: unknown) => String(value ?? '').toLowerCase();
    const s = normalize(globalSearch);
    return {
      tools: tools.filter(t => normalize(t?.name).includes(s)).slice(0, 3),
      news: news.filter(n => normalize(n?.title).includes(s)).slice(0, 2),
      employees: employees.filter(e => normalize(e?.name).includes(s)).slice(0, 3),
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

  useEffect(() => {
    const shouldForce = Boolean(currentUser?.password_change_required);
    setForcePasswordChange(shouldForce);
    if (shouldForce) {
      setChangePasswordModalOpen(true);
    }
  }, [currentUser?.id, currentUser?.password_change_required]);

  const handleViewAllSearch = () => {
    setView(AppView.SEARCH_RESULTS);
    setShowSearchPreview(false);
  };

  const markAllAsRead = () => {
    ApiClient.markAllNotificationsRead().catch((e) => {
      console.error('Failed to mark all notifications as read', e);
    });

    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, isRead: true }));
      persistReadStates(next);
      return next;
    });
  };

  const openNotificationTarget = (actionUrl?: string) => {
    if (!actionUrl) return;
    const target = actionUrl.trim();
    if (!target) return;
    if (/^https?:\/\//i.test(target)) {
      window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }
    window.location.assign(target.startsWith('/') ? target : `/${target}`);
  };

  const markAsRead = async (notification: Notification) => {
    const backendNotificationId = parseBackendNotificationId(notification.id);
    if (backendNotificationId !== null) {
      try {
        await ApiClient.markNotificationsRead([backendNotificationId]);
      } catch (e) {
        console.error('Failed to mark notification as read', e);
      }
    } else {
      try {
        await ApiClient.logBusinessAction({
          action: 'LOCAL_NOTIFICATION_CLICK',
          target: notification.title,
          detail: `notification_id=${notification.id}`,
        });
      } catch (e) {
        console.error('Failed to log local notification click', e);
      }
    }

    setNotifications(prev => {
      const next = prev.map(n => n.id === notification.id ? { ...n, isRead: true } : n);
      persistReadStates(next);
      return next;
    });
    setIsNotificationsOpen(false);
    openNotificationTarget(notification.actionUrl);
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
  const username = currentUser?.username || t('navbar.defaults.username');
  const hasAdminIdentity = hasAdminAccess(currentUser);
  const userRole = hasAdminIdentity ? t('navbar.defaults.adminRole') : t('navbar.defaults.userRole');

  let userAvatar = currentUser?.avatar;
  if (!userAvatar) {
    if (hasAdminIdentity) {
      userAvatar = '/images/admin-avatar.svg';
    } else {
      userAvatar = '/images/default-avatar.svg';
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
              {systemConfig?.app_name || t('navbar.defaults.appName')}
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
              placeholder={t('navbar.search.placeholder')}
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
                    <span>{t('navbar.search.aiThinking')}</span>
                  </div>
                ) : aiPreviewAnswer && (
                  <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                    <div className="flex items-center space-x-2 mb-1 text-blue-600 dark:text-blue-400">
                      <Sparkles size={12} />
                      <span className="text-[10px] font-black uppercase tracking-wider">{t('navbar.search.aiAssistant')}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{aiPreviewAnswer}</p>
                  </div>
                )}

                {/* Local Results */}
                {previewResults && (
                  <div className="space-y-3 mb-3">
                    {previewResults.tools.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">{t('navbar.search.appsSection')}</h4>
                        {previewResults.tools.map((t: any) => (
                          <div key={t.id} className="flex items-center space-x-2 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                            <div className="w-5 h-5 rounded bg-white shadow-sm flex items-center justify-center text-xs overflow-hidden">
                              {t.image ? <img src={t.image} alt={t.name} className="w-full h-full object-cover" /> : <Grid size={10} />}
                            </div>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* External Engines */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">{t('navbar.search.webSearch')}</h4>
                  <div className="space-y-1">
                    <button onClick={() => openExternalSearch('google')} className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-xs font-bold text-slate-600 dark:text-slate-300">
                      Google
                    </button>
                    <button onClick={() => openExternalSearch('bing')} className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-xs font-bold text-slate-600 dark:text-slate-300">
                      Bing
                    </button>
                    <button onClick={() => openExternalSearch('baidu')} className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-xs font-bold text-slate-600 dark:text-slate-300">
                      {t('navbar.search.baidu')}
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

            {/* Notifications Dropdown */}
            {isNotificationsOpen && (
              <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 cursor-default">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('navbar.notifications.title')}</h3>
                  {unreadCount > 0 && (
                    <button onClick={markAllAsRead} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                      {t('navbar.notifications.markAllRead')}
                    </button>
                  )}
                </div>
                <div className="max-h-[300px] overflow-y-auto overscroll-contain">
                  {notifications.length > 0 ? (
                    <div className="py-2">
                      {notifications.map(notification => (
                        <div
                          key={notification.id}
                          onClick={() => {
                            void markAsRead(notification);
                          }}
                          className={`px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer flex gap-3 ${!notification.isRead ? 'bg-blue-50/30 dark:bg-blue-900/10' : 'opacity-70'
                            }`}
                        >
                          <div className="mt-0.5 shrink-0">
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className={`text-sm ${!notification.isRead ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                                {notification.title}
                              </p>
                              {notification.isRead && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  {t('navbar.notifications.read')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                              {notification.message}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium">
                              {notification.time}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                      <Bell size={32} className="mb-3 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm">{t('navbar.notifications.empty')}</p>
                    </div>
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <button
                      onClick={() => {
                        setView(AppView.DASHBOARD);
                        setIsNotificationsOpen(false);
                      }}
                      className="w-full py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                    >
                      {t('navbar.notifications.viewAll')}
                    </button>
                  </div>
                )}
              </div>
            )}
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
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('navbar.profile.settings')}</span>
                  </button>
                  <button
                    onClick={() => {
                      setView(AppView.SECURITY);
                      setIsProfileOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></svg>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('navbar.profile.security', '安全设置')}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (onLogout) onLogout();
                      setIsProfileOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors text-left group"
                  >
                    <LogOut size={16} className="text-slate-400 group-hover:text-rose-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-rose-600">{t('navbar.profile.logout')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
      {/* Modals */}
      <ChangePasswordModal
        open={changePasswordModalOpen}
        onClose={() => {
          if (forcePasswordChange) return;
          setChangePasswordModalOpen(false);
        }}
        onSuccess={() => {
          setForcePasswordChange(false);
          setChangePasswordModalOpen(false);
          // Optional: handle auth refresh or force relogin; for now just close
        }}
        forceMode={forcePasswordChange}
      />
    </div>
  );
};

export default Navbar;
