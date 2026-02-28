import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

export const I18N_STORAGE_KEY = 'app_locale';
export const LEGACY_I18N_STORAGE_KEY = 'locale';
const USER_I18N_STORAGE_PREFIX = 'app_locale_user:';
export type AppLanguage = 'zh-CN' | 'en-US';
export type LanguagePreferenceScope = string | number | null | undefined;

export const normalizeLanguage = (candidate?: string | null): AppLanguage => {
  const value = String(candidate || '').trim().toLowerCase();
  return value.startsWith('zh') ? 'zh-CN' : 'en-US';
};

const normalizeScope = (scope?: LanguagePreferenceScope): string | null => {
  const value = String(scope ?? '').trim();
  return value ? value : null;
};

const getUserStorageKey = (scope: string) => `${USER_I18N_STORAGE_PREFIX}${scope}`;

export const buildUserLanguageScope = (
  user?: { id?: string | number | null; username?: string | null } | null,
): string | undefined => {
  const userId = user?.id;
  if (userId !== null && userId !== undefined) {
    const normalizedId = String(userId).trim();
    if (normalizedId) return `uid:${normalizedId}`;
  }
  const username = String(user?.username || '').trim().toLowerCase();
  if (username) return `uname:${username}`;
  return undefined;
};

export const getLanguagePreference = (
  scope?: LanguagePreferenceScope,
  fallbackToGlobal: boolean = true,
): AppLanguage | null => {
  if (typeof window === 'undefined') return null;

  const normalizedScope = normalizeScope(scope);
  if (normalizedScope) {
    const scopedValue = window.localStorage.getItem(getUserStorageKey(normalizedScope));
    if (scopedValue) return normalizeLanguage(scopedValue);
  }

  if (!fallbackToGlobal) return null;
  const globalValue = window.localStorage.getItem(I18N_STORAGE_KEY) || window.localStorage.getItem(LEGACY_I18N_STORAGE_KEY);
  if (globalValue) return normalizeLanguage(globalValue);
  return null;
};

const getInitialLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') {
    return 'zh-CN';
  }

  const fromStorage = getLanguagePreference();
  if (fromStorage) {
    return fromStorage;
  }

  const fromEnv = import.meta.env.VITE_APP_LOCALE as string | undefined;
  if (fromEnv) {
    return normalizeLanguage(fromEnv);
  }

  return normalizeLanguage(window.navigator.language || 'zh-CN');
};

export const setLanguagePreference = (language: AppLanguage, scope?: LanguagePreferenceScope) => {
  if (typeof window === 'undefined') return;
  const normalizedLanguage = normalizeLanguage(language);
  const normalizedScope = normalizeScope(scope);
  if (normalizedScope) {
    window.localStorage.setItem(getUserStorageKey(normalizedScope), normalizedLanguage);
  }
  window.localStorage.setItem(I18N_STORAGE_KEY, normalizedLanguage);
  window.localStorage.setItem(LEGACY_I18N_STORAGE_KEY, normalizedLanguage);
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en-US'],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });

setLanguagePreference(normalizeLanguage(i18n.resolvedLanguage || i18n.language));

export default i18n;
