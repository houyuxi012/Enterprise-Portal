import React from 'react';
import { Segmented } from 'antd';
import { useTranslation } from 'react-i18next';
import { AppLanguage, normalizeLanguage, setLanguagePreference } from '../i18n';

interface LanguageSwitcherProps {
  size?: 'small' | 'middle' | 'large';
  className?: string;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ size = 'small', className }) => {
  const { i18n, t } = useTranslation();
  const language = normalizeLanguage(i18n.resolvedLanguage || i18n.language);

  const handleChange = (value: string | number) => {
    const nextLanguage = String(value) as AppLanguage;
    setLanguagePreference(nextLanguage);
    void i18n.changeLanguage(nextLanguage);
  };

  return (
    <Segmented
      size={size}
      className={className}
      value={language}
      onChange={handleChange}
      options={[
        { label: t('common.language.zhCN'), value: 'zh-CN' },
        { label: t('common.language.enUS'), value: 'en-US' },
      ]}
    />
  );
};

export default LanguageSwitcher;
