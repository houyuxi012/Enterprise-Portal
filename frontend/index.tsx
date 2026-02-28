
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { themeConfig } from './theme';
import i18n, { normalizeLanguage, setLanguagePreference } from './i18n';
import { I18nextProvider, useTranslation } from 'react-i18next';

const AppShell: React.FC = () => {
  const { i18n: i18nextInstance } = useTranslation();
  const language = normalizeLanguage(i18nextInstance.resolvedLanguage || i18nextInstance.language);

  useEffect(() => {
    setLanguagePreference(language);
    dayjs.locale(language === 'zh-CN' ? 'zh-cn' : 'en');
  }, [language]);

  return (
    <ConfigProvider theme={themeConfig} locale={language === 'zh-CN' ? zhCN : enUS}>
      <AntApp>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <AppShell />
    </I18nextProvider>
  </React.StrictMode>
);
