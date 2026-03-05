import React, { useEffect } from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { AuthProvider } from '../contexts/AuthContext';
import { themeConfig } from '../theme';
import i18n, { normalizeLanguage, setLanguagePreference } from '../i18n';

interface AppProvidersProps {
  children: React.ReactNode;
}

const InternalProviders: React.FC<AppProvidersProps> = ({ children }) => {
  const { i18n: i18nextInstance } = useTranslation();
  const language = normalizeLanguage(i18nextInstance.resolvedLanguage || i18nextInstance.language);

  useEffect(() => {
    setLanguagePreference(language);
    dayjs.locale(language === 'zh-CN' ? 'zh-cn' : 'en');
  }, [language]);

  return (
    <ConfigProvider theme={themeConfig} locale={language === 'zh-CN' ? zhCN : enUS}>
      <AntApp>
        <AuthProvider>{children}</AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
};

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <InternalProviders>{children}</InternalProviders>
  </I18nextProvider>
);
