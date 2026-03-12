import React, { useEffect, useMemo, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Divider from 'antd/es/divider';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import { SaveOutlined, SendOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import ApiClient from '@/services/api';
import { AppButton, AppForm } from '@/modules/admin/components/ui';

const MASKED_VALUE = '__MASKED__';

type ApiErrorShape = {
  response?: {
    data?: {
      detail?: unknown;
    };
  };
};

type FormValidationErrorShape = {
  errorFields?: unknown;
};

interface NotificationTelegramPanelProps {
  config: Record<string, string>;
  imTemplateOptions: Array<{ value: number; label: string }>;
  onManageTemplate: () => void;
  onUpdated: () => Promise<void>;
}

const hasFormValidationErrors = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const errorFields = (error as FormValidationErrorShape).errorFields;
  return Array.isArray(errorFields) && errorFields.length > 0;
};

const resolveErrorMessage = (error: unknown, fallback: string): string => {
  const detail = (error as ApiErrorShape)?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const messageValue = (detail as { message?: unknown }).message;
    if (typeof messageValue === 'string' && messageValue.trim()) {
      return messageValue;
    }
  }
  return fallback;
};

const NotificationTelegramPanel: React.FC<NotificationTelegramPanelProps> = ({
  config,
  imTemplateOptions,
  onManageTemplate,
  onUpdated,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const secretPresence = useMemo(() => {
    const raw = String(config.telegram_bot_token || '').trim();
    return raw === MASKED_VALUE || raw.length > 0;
  }, [config]);

  useEffect(() => {
    const telegramTokenMasked = String(config.telegram_bot_token || '').trim() === MASKED_VALUE;
    form.setFieldsValue({
      telegram_bot_enabled: (config.telegram_bot_enabled || 'false') === 'true',
      telegram_bot_token: telegramTokenMasked ? '' : (config.telegram_bot_token || ''),
      telegram_chat_id: config.telegram_chat_id || '',
      telegram_parse_mode: config.telegram_parse_mode || 'none',
      telegram_disable_web_page_preview: (config.telegram_disable_web_page_preview || 'true') === 'true',
      telegram_test_message: config.telegram_test_message || t('notificationServices.telegram.defaultTestMessage'),
      notification_im_template_id: config.notification_im_template_id ? Number(config.notification_im_template_id) : undefined,
    });
  }, [config, form, t]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const hasToken = Boolean(values.telegram_bot_token || secretPresence);
      if (values.telegram_bot_enabled && (!hasToken || !values.telegram_chat_id)) {
        message.error(t('notificationServices.telegram.validation.tokenAndChatRequiredWhenEnabled'));
        return;
      }
      setSaving(true);
      const pairs: Record<string, string> = {
        telegram_bot_enabled: values.telegram_bot_enabled ? 'true' : 'false',
        telegram_chat_id: values.telegram_chat_id || '',
        telegram_parse_mode: values.telegram_parse_mode || 'MarkdownV2',
        telegram_disable_web_page_preview: values.telegram_disable_web_page_preview ? 'true' : 'false',
        notification_im_template_id: values.notification_im_template_id ? String(values.notification_im_template_id) : '',
      };
      if (values.telegram_bot_token) {
        pairs.telegram_bot_token = values.telegram_bot_token;
      } else if (!secretPresence) {
        pairs.telegram_bot_token = '';
      }
      await ApiClient.updateSystemConfig(pairs);
      await onUpdated();
      message.success(t('notificationServices.messages.telegramSaved'));
    } catch (error: unknown) {
      if (hasFormValidationErrors(error)) return;
      message.error(resolveErrorMessage(error, t('notificationServices.messages.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const values = form.getFieldsValue();
      await ApiClient.testTelegramBot({
        bot_token: values.telegram_bot_token || undefined,
        chat_id: values.telegram_chat_id || undefined,
        parse_mode: values.telegram_parse_mode || undefined,
        disable_web_page_preview: Boolean(values.telegram_disable_web_page_preview),
        message: values.telegram_test_message || t('notificationServices.telegram.defaultTestMessage'),
        template_id: values.notification_im_template_id || undefined,
      });
      message.success(t('notificationServices.messages.telegramTestSuccess'));
    } catch (error: unknown) {
      message.error(resolveErrorMessage(error, t('notificationServices.messages.telegramTestFailed')));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="admin-card">
      <AppForm
        form={form}
        layout="vertical"
        className="max-w-2xl"
        initialValues={{
          telegram_bot_enabled: false,
          telegram_parse_mode: 'none',
          telegram_disable_web_page_preview: true,
          telegram_test_message: t('notificationServices.telegram.defaultTestMessage'),
        }}
      >
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item
            name="telegram_bot_enabled"
            label={<span className="font-semibold">{t('notificationServices.telegram.fields.enabled')}</span>}
            valuePropName="checked"
          >
            <Switch
              checkedChildren={t('notificationServices.labels.enabled')}
              unCheckedChildren={t('notificationServices.labels.disabled')}
            />
          </Form.Item>
          <Form.Item
            name="telegram_parse_mode"
            label={<span className="font-semibold">{t('notificationServices.telegram.fields.parseMode')}</span>}
          >
            <Select
              options={[
                { value: 'MarkdownV2', label: 'MarkdownV2' },
                { value: 'HTML', label: 'HTML' },
                { value: 'none', label: t('notificationServices.telegram.options.none') },
              ]}
            />
          </Form.Item>
        </div>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item
            name="telegram_bot_token"
            label={<span className="font-semibold">{t('notificationServices.telegram.fields.botToken')}</span>}
            rules={[
              {
                validator: async (_, value: string | undefined) => {
                  const enabled = Boolean(form.getFieldValue('telegram_bot_enabled'));
                  if (!enabled || String(value || '').trim() || secretPresence) return;
                  throw new Error(t('notificationServices.telegram.validation.botTokenRequired'));
                },
              },
            ]}
          >
            <Input.Password placeholder={t('notificationServices.telegram.placeholders.botToken')} />
          </Form.Item>
          <Form.Item
            name="telegram_chat_id"
            label={<span className="font-semibold">{t('notificationServices.telegram.fields.chatId')}</span>}
            rules={[
              {
                validator: async (_, value: string | undefined) => {
                  const enabled = Boolean(form.getFieldValue('telegram_bot_enabled'));
                  if (!enabled || String(value || '').trim()) return;
                  throw new Error(t('notificationServices.telegram.validation.chatIdRequired'));
                },
              },
            ]}
          >
            <Input placeholder={t('notificationServices.telegram.placeholders.chatId')} />
          </Form.Item>
        </div>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item
            name="telegram_disable_web_page_preview"
            label={<span className="font-semibold">{t('notificationServices.telegram.fields.disableWebPreview')}</span>}
            valuePropName="checked"
          >
            <Switch
              checkedChildren={t('notificationServices.labels.enabled')}
              unCheckedChildren={t('notificationServices.labels.disabled')}
            />
          </Form.Item>
          <Form.Item
            name="notification_im_template_id"
            label={<span className="font-semibold">{t('notificationServices.templates.imTemplate')}</span>}
            help={t('notificationServices.templates.imTemplateHelp')}
          >
            <Select
              allowClear
              options={imTemplateOptions}
              placeholder={t('notificationServices.templates.imTemplatePlaceholder')}
              notFoundContent={t('notificationServices.templates.empty')}
            />
          </Form.Item>
        </div>
        <Form.Item
          name="telegram_test_message"
          label={<span className="font-semibold">{t('notificationServices.telegram.fields.testMessage')}</span>}
          help={t('notificationServices.telegram.help.testMessage')}
        >
          <Input.TextArea rows={3} maxLength={500} placeholder={t('notificationServices.telegram.placeholders.testMessage')} />
        </Form.Item>
        <AppButton intent="tertiary" onClick={onManageTemplate}>
          {t('notificationServices.templates.manageIm')}
        </AppButton>
        <Divider />
        <Space>
          <AppButton intent="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            {t('notificationServices.actions.save')}
          </AppButton>
          <AppButton icon={<SendOutlined />} onClick={handleTest} loading={testing}>
            {t('notificationServices.actions.sendTest')}
          </AppButton>
        </Space>
      </AppForm>
    </Card>
  );
};

export default NotificationTelegramPanel;
