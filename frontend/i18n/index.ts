import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

export const I18N_STORAGE_KEY = 'app_locale';
export type AppLanguage = 'zh-CN' | 'en-US';

export const normalizeLanguage = (candidate?: string | null): AppLanguage => {
  const value = String(candidate || '').trim().toLowerCase();
  return value.startsWith('zh') ? 'zh-CN' : 'en-US';
};

const getInitialLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') {
    return 'zh-CN';
  }

  const fromStorage = window.localStorage.getItem(I18N_STORAGE_KEY) || window.localStorage.getItem('locale');
  if (fromStorage) {
    return normalizeLanguage(fromStorage);
  }

  const fromEnv = import.meta.env.VITE_APP_LOCALE as string | undefined;
  if (fromEnv) {
    return normalizeLanguage(fromEnv);
  }

  return normalizeLanguage(window.navigator.language || 'zh-CN');
};

export const setLanguagePreference = (language: AppLanguage) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(I18N_STORAGE_KEY, language);
  window.localStorage.setItem('locale', language);
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
