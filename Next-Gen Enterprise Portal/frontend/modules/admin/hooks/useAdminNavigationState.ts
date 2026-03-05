import { useCallback, useEffect, useState } from 'react';
import {
  ADMIN_DEFAULT_TAB,
  ADMIN_DIRECTORY_TAB,
  isAdminTabKey,
  type AdminTabKey,
} from '../types/tabKeys';

const ACTIVE_TAB_STORAGE_KEY = 'activeAdminTab';

const resolveInitialTab = (): AdminTabKey => {
  if (typeof window === 'undefined') return ADMIN_DEFAULT_TAB;

  if (window.location.pathname.startsWith('/admin/iam/directories')) {
    return ADMIN_DIRECTORY_TAB;
  }
  const saved = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  if (isAdminTabKey(saved)) {
    return saved;
  }
  return ADMIN_DEFAULT_TAB;
};

interface UseAdminNavigationStateResult {
  activeAdminTab: AdminTabKey;
  setActiveAdminTab: (tab: AdminTabKey) => void;
  syncAdminTabPath: (tab: string) => AdminTabKey;
  openAdminHome: () => void;
}

export const useAdminNavigationState = (): UseAdminNavigationStateResult => {
  const [activeAdminTab, setActiveAdminTabState] = useState<AdminTabKey>(resolveInitialTab);

  const setActiveAdminTab = useCallback((tab: AdminTabKey) => {
    setActiveAdminTabState(tab);
  }, []);

  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeAdminTab);
  }, [activeAdminTab]);

  useEffect(() => {
    const syncAdminTabByPath = () => {
      if (typeof window === 'undefined') return;
      if (window.location.pathname.startsWith('/admin/iam/directories')) {
        setActiveAdminTabState(ADMIN_DIRECTORY_TAB);
      } else if (window.location.pathname === '/admin' && activeAdminTab === ADMIN_DIRECTORY_TAB) {
        setActiveAdminTabState(ADMIN_DEFAULT_TAB);
      }
    };
    window.addEventListener('popstate', syncAdminTabByPath);
    return () => {
      window.removeEventListener('popstate', syncAdminTabByPath);
    };
  }, [activeAdminTab]);

  const syncAdminTabPath = useCallback((tab: string): AdminTabKey => {
    const nextTab: AdminTabKey = isAdminTabKey(tab) ? tab : ADMIN_DEFAULT_TAB;
    setActiveAdminTabState(nextTab);
    if (typeof window !== 'undefined') {
      const nextPath = nextTab === ADMIN_DIRECTORY_TAB ? '/admin/iam/directories' : '/admin';
      window.history.pushState({}, '', nextPath);
    }
    return nextTab;
  }, []);

  const openAdminHome = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/admin');
    }
  }, []);

  return {
    activeAdminTab,
    setActiveAdminTab,
    syncAdminTabPath,
    openAdminHome,
  };
};
