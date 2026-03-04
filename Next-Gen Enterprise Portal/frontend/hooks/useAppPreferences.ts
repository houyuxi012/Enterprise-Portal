import { useCallback, useEffect, useMemo, useState } from 'react';
import { i18n as I18nInstance } from 'i18next';
import {
  AppLanguage,
  buildUserLanguageScope,
  normalizeLanguage,
  setLanguagePreference,
} from '../i18n';

export type ThemeMode = 'light' | 'dark' | 'system';

interface UseAppPreferencesOptions {
  i18n: I18nInstance;
  currentUser?: { id?: string | number | null; username?: string | null } | null;
}

interface UseAppPreferencesResult {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  currentLanguage: AppLanguage;
  handleLanguageChange: (nextLanguage: AppLanguage) => void;
}

const readInitialThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  const saved = window.localStorage.getItem('theme-mode');
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
};

const applyThemeMode = (mode: ThemeMode) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const root = document.documentElement;
  const isDark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
};

export const useAppPreferences = ({
  i18n,
  currentUser,
}: UseAppPreferencesOptions): UseAppPreferencesResult => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const userLanguageScope = useMemo(
    () => buildUserLanguageScope(currentUser),
    [currentUser?.id, currentUser?.username],
  );

  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage || i18n.language);
  const handleLanguageChange = useCallback(
    (nextLanguage: AppLanguage) => {
      setLanguagePreference(nextLanguage, userLanguageScope);
      void i18n.changeLanguage(nextLanguage);
    },
    [i18n, userLanguageScope],
  );

  useEffect(() => {
    applyThemeMode(themeMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('theme-mode', themeMode);
    }
    if (themeMode !== 'system' || typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyThemeMode('system');
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  return {
    themeMode,
    setThemeMode,
    currentLanguage,
    handleLanguageChange,
  };
};
