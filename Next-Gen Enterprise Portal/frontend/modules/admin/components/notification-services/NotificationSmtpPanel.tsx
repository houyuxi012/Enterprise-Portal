import React, { useEffect, useMemo, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Divider from 'antd/es/divider';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
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

interface NotificationSmtpPanelProps {
  config: Record<string, string>;
  emailTemplateOptions: Array<{ value: number; label: string }>;
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

const NotificationSmtpPanel: React.FC<NotificationSmtpPanelProps> = ({
  config,
  emailTemplateOptions,
  onManageTemplate,
  onUpdated,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const smtpPasswordInput = Form.useWatch('smtp_password', form);

  const secretPresence = useMemo(() => {
    const raw = String(config.smtp_password || '').trim();
    return raw === MASKED_VALUE || raw.length > 0;
  }, [config]);

  useEffect(() => {
    const smtpPasswordMasked = String(config.smtp_password || '').trim() === MASKED_VALUE;
    form.setFieldsValue({
      smtp_host: config.smtp_host || '',
      smtp_port: Number.parseInt(config.smtp_port || '465', 10),
      smtp_username: config.smtp_username || '',
      smtp_password: smtpPasswordMasked ? '' : (config.smtp_password || ''),
      smtp_use_tls: (config.smtp_use_tls || 'true') === 'true',
      smtp_sender: config.smtp_sender || config.smtp_username || '',
      smtp_test_email: config.smtp_test_email || config.smtp_sender || config.smtp_username || '',
      notification_email_template_id: config.notification_email_template_id ? Number(config.notification_email_template_id) : undefined,
    });
  }, [config, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const pairs: Record<string, string> = {
        smtp_host: values.smtp_host,
        smtp_port: String(values.smtp_port),
        smtp_username: values.smtp_username,
        smtp_use_tls: values.smtp_use_tls ? 'true' : 'false',
        smtp_sender: values.smtp_sender || values.smtp_username,
        smtp_test_email: values.smtp_test_email || '',
        notification_email_template_id: values.notification_email_template_id ? String(values.notification_email_template_id) : '',
      };
      if (values.smtp_password) {
        pairs.smtp_password = values.smtp_password;
      } else if (!secretPresence) {
        pairs.smtp_password = '';
      }
      await ApiClient.updateSystemConfig(pairs);
      await onUpdated();
      message.success(t('notificationServices.messages.smtpSaved'));
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
      const toEmail = values.smtp_test_email;
      if (!toEmail) {
        message.error(t('notificationServices.smtp.validation.testEmailRequired'));
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
        message.error(t('notificationServices.smtp.validation.testEmailInvalid'));
        return;
      }
      await ApiClient.testSmtp({
        to_email: toEmail,
        template_id: values.notification_email_template_id || undefined,
      });
      message.success(t('notificationServices.messages.smtpTestSuccess'));
    } catch (error: unknown) {
      message.error(resolveErrorMessage(error, t('notificationServices.messages.smtpTestFailed')));
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
          smtp_port: 465,
          smtp_use_tls: true,
        }}
      >
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item
            name="smtp_host"
            label={<span className="font-semibold">{t('notificationServices.smtp.fields.host')}</span>}
            rules={[{ required: true, message: t('notificationServices.smtp.validation.hostRequired') }]}
          >
            <Input placeholder={t('notificationServices.smtp.placeholders.host')} />
          </Form.Item>
          <Form.Item
            name="smtp_port"
            label={<span className="font-semibold">{t('notificationServices.smtp.fields.port')}</span>}
            rules={[{ required: true, message: t('notificationServices.smtp.validation.portRequired') }]}
          >
            <InputNumber min={1} max={65535} className="w-full" placeholder="465" />
          </Form.Item>
        </div>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item
            name="smtp_username"
            label={<span className="font-semibold">{t('notificationServices.smtp.fields.username')}</span>}
            rules={[{ required: true, message: t('notificationServices.smtp.validation.usernameRequired') }]}
          >
            <Input placeholder={t('notificationServices.smtp.placeholders.username')} />
          </Form.Item>
          <Form.Item
            name="smtp_password"
            label={<span className="font-semibold">{t('notificationServices.smtp.fields.password')}</span>}
            rules={[
              {
                validator: async (_, value: string | undefined) => {
                  if (String(value || '').trim() || secretPresence) return;
                  throw new Error(t('notificationServices.smtp.validation.passwordRequired'));
                },
              },
            ]}
          >
            <Input.Password
              placeholder={
                secretPresence && !String(smtpPasswordInput || '').trim()
                  ? '********'
                  : t('notificationServices.smtp.placeholders.password')
              }
            />
          </Form.Item>
        </div>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item
            name="smtp_sender"
            label={<span className="font-semibold">{t('notificationServices.smtp.fields.sender')}</span>}
            help={t('notificationServices.smtp.help.sender')}
          >
            <Input placeholder="noreply@example.com" />
          </Form.Item>
          <Form.Item
            name="smtp_use_tls"
            label={<span className="font-semibold">{t('notificationServices.smtp.fields.tls')}</span>}
            valuePropName="checked"
          >
            <Switch
              checkedChildren={t('notificationServices.labels.enabled')}
              unCheckedChildren={t('notificationServices.labels.disabled')}
            />
          </Form.Item>
        </div>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item
            name="smtp_test_email"
            label={<span className="font-semibold">{t('notificationServices.smtp.fields.testEmail')}</span>}
            rules={[
              { required: true, message: t('notificationServices.smtp.validation.testEmailRequired') },
              { type: 'email', message: t('notificationServices.smtp.validation.testEmailInvalid') },
            ]}
          >
            <Input placeholder={t('notificationServices.smtp.placeholders.testEmail')} />
          </Form.Item>
          <Form.Item
            name="notification_email_template_id"
            label={<span className="font-semibold">{t('notificationServices.templates.emailTemplate')}</span>}
            help={t('notificationServices.templates.emailTemplateHelp')}
          >
            <Select
              allowClear
              options={emailTemplateOptions}
              placeholder={t('notificationServices.templates.emailTemplatePlaceholder')}
              notFoundContent={t('notificationServices.templates.empty')}
            />
          </Form.Item>
        </div>
        <AppButton intent="tertiary" onClick={onManageTemplate}>
          {t('notificationServices.templates.manageEmail')}
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

export default NotificationSmtpPanel;
