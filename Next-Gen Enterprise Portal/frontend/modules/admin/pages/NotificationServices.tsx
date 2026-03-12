import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import Tag from 'antd/es/tag';
import Tabs from 'antd/es/tabs';
import { useTranslation } from 'react-i18next';

import ApiClient from '@/services/api';
import { AppPageHeader } from '@/modules/admin/components/ui';
import notificationTemplateService, {
  NOTIFICATION_TEMPLATE_ACTIVE_CATEGORY_STORAGE_KEY,
  type NotificationTemplateRecord,
} from '@/modules/admin/services/notificationTemplates';
import type { NotificationTemplateCategory, NotificationTemplateLocale } from '@/shared/services/api';

const NotificationSmtpPanel = lazy(() => import('@/modules/admin/components/notification-services/NotificationSmtpPanel'));
const NotificationTelegramPanel = lazy(() => import('@/modules/admin/components/notification-services/NotificationTelegramPanel'));
const NotificationSmsPanel = lazy(() => import('@/modules/admin/components/notification-services/NotificationSmsPanel'));

type SmsProvider = 'aliyun' | 'tencent' | 'twilio';

const MASKED_VALUE = '__MASKED__';
const ACTIVE_ADMIN_TAB_STORAGE_KEY = 'activeAdminTab';

const normalizeTemplateLocale = (locale: string | undefined): NotificationTemplateLocale => (
  String(locale || '').toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
);

const getLocalizedTemplateLabel = (
  template: NotificationTemplateRecord,
  locale: NotificationTemplateLocale,
): string => String(template.name_i18n?.[locale] || template.name || '').trim();

const isMaskedValue = (value: unknown): boolean => String(value ?? '').trim() === MASKED_VALUE;

const isSmtpConfigured = (config: Record<string, string>): boolean =>
  Boolean(String(config.smtp_host || '').trim());

const isTelegramConfigured = (config: Record<string, string>): boolean =>
  Boolean(
    (String(config.telegram_bot_token || '').trim() && String(config.telegram_chat_id || '').trim())
    || (isMaskedValue(config.telegram_bot_token) && String(config.telegram_chat_id || '').trim()),
  );

const isSmsConfigured = (config: Record<string, string>): boolean => {
  const enabled = (config.sms_enabled || 'false') === 'true';
  const provider = (config.sms_provider || '') as SmsProvider | '';
  if (!enabled || !provider) return false;

  if (provider === 'aliyun') {
    return Boolean(
      config.sms_access_key_id
      && (config.sms_access_key_secret || isMaskedValue(config.sms_access_key_secret))
      && config.sms_sign_name
      && config.sms_template_code,
    );
  }

  if (provider === 'tencent') {
    return Boolean(
      config.tencent_secret_id
      && (config.tencent_secret_key || isMaskedValue(config.tencent_secret_key))
      && config.tencent_sdk_app_id
      && config.tencent_sign_name
      && config.tencent_template_id,
    );
  }

  if (provider === 'twilio') {
    return Boolean(
      config.twilio_account_sid
      && (config.twilio_auth_token || isMaskedValue(config.twilio_auth_token))
      && (config.twilio_from_number || config.twilio_messaging_service_sid),
    );
  }

  return false;
};

const NotificationServices: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [notificationConfig, setNotificationConfig] = useState<Record<string, string>>({});
  const [notificationTemplates, setNotificationTemplates] = useState<NotificationTemplateRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'smtp' | 'telegram' | 'sms'>('smtp');
  const currentTemplateLocale = normalizeTemplateLocale(i18n.resolvedLanguage || i18n.language);

  const refreshNotificationState = useCallback(async () => {
    const [config, templates] = await Promise.all([
      ApiClient.getSystemConfig(),
      notificationTemplateService.listTemplates(),
    ]);
    setNotificationConfig(config);
    setNotificationTemplates(templates);
  }, []);

  useEffect(() => {
    void refreshNotificationState();
  }, [refreshNotificationState]);

  const openTemplateLibrary = (category: NotificationTemplateCategory): void => {
    window.localStorage.setItem(ACTIVE_ADMIN_TAB_STORAGE_KEY, 'notification_templates');
    window.localStorage.setItem(NOTIFICATION_TEMPLATE_ACTIVE_CATEGORY_STORAGE_KEY, category);
    window.location.href = '/admin';
  };

  const emailTemplateOptions = useMemo(
    () => notificationTemplates
      .filter((template) => template.category === 'email' && template.is_enabled)
      .map((template) => ({ value: template.id, label: getLocalizedTemplateLabel(template, currentTemplateLocale) })),
    [currentTemplateLocale, notificationTemplates],
  );

  const smsTemplateOptions = useMemo(
    () => notificationTemplates
      .filter((template) => template.category === 'sms' && template.is_enabled)
      .map((template) => ({ value: template.id, label: getLocalizedTemplateLabel(template, currentTemplateLocale) })),
    [currentTemplateLocale, notificationTemplates],
  );

  const imTemplateOptions = useMemo(
    () => notificationTemplates
      .filter((template) => template.category === 'im' && template.is_enabled)
      .map((template) => ({ value: template.id, label: getLocalizedTemplateLabel(template, currentTemplateLocale) })),
    [currentTemplateLocale, notificationTemplates],
  );

  const smtpConfigured = useMemo(() => isSmtpConfigured(notificationConfig), [notificationConfig]);
  const telegramConfigured = useMemo(() => isTelegramConfigured(notificationConfig), [notificationConfig]);
  const smsConfigured = useMemo(() => isSmsConfigured(notificationConfig), [notificationConfig]);

  return (
    <div className="admin-page admin-page-spaced">
      <AppPageHeader
        title={t('notificationServices.title')}
        subtitle={t('notificationServices.subtitle')}
      />

      <Tabs
        activeKey={activeTab}
        onChange={(value) => setActiveTab(value as 'smtp' | 'telegram' | 'sms')}
        destroyOnHidden
        items={[
          {
            key: 'smtp',
            label: (
              <span className="flex items-center gap-2">
                <span>{t('notificationServices.tabs.smtp')}</span>
                {smtpConfigured ? <Tag color="green">{t('notificationServices.labels.configured')}</Tag> : null}
              </span>
            ),
            children: (
              <Suspense fallback={null}>
                <NotificationSmtpPanel
                  config={notificationConfig}
                  emailTemplateOptions={emailTemplateOptions}
                  onManageTemplate={() => openTemplateLibrary('email')}
                  onUpdated={refreshNotificationState}
                />
              </Suspense>
            ),
          },
          {
            key: 'telegram',
            label: (
              <span className="flex items-center gap-2">
                <span>{t('notificationServices.tabs.telegram')}</span>
                {telegramConfigured ? <Tag color="green">{t('notificationServices.labels.configured')}</Tag> : null}
              </span>
            ),
            children: (
              <Suspense fallback={null}>
                <NotificationTelegramPanel
                  config={notificationConfig}
                  imTemplateOptions={imTemplateOptions}
                  onManageTemplate={() => openTemplateLibrary('im')}
                  onUpdated={refreshNotificationState}
                />
              </Suspense>
            ),
          },
          {
            key: 'sms',
            label: (
              <span className="flex items-center gap-2">
                <span>{t('notificationServices.tabs.sms')}</span>
                {smsConfigured ? <Tag color="green">{t('notificationServices.labels.configured')}</Tag> : null}
              </span>
            ),
            children: (
              <Suspense fallback={null}>
                <NotificationSmsPanel
                  config={notificationConfig}
                  smsTemplateOptions={smsTemplateOptions}
                  onManageTemplate={() => openTemplateLibrary('sms')}
                  onUpdated={refreshNotificationState}
                />
              </Suspense>
            ),
          },
        ]}
      />
    </div>
  );
};

export default NotificationServices;
