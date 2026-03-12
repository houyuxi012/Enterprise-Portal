import React, { useEffect, useMemo, useState } from 'react';
import App from 'antd/es/app';
import Alert from 'antd/es/alert';
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

type SmsProvider = 'aliyun' | 'tencent' | 'twilio';

type ApiErrorShape = {
  response?: {
    data?: {
      detail?: unknown;
    };
  };
};

type SmsConfig = {
  sms_enabled: boolean;
  sms_provider?: SmsProvider;
  sms_test_phone: string;
  sms_test_message: string;
  sms_access_key_id: string;
  sms_access_key_secret: string;
  sms_sign_name: string;
  sms_template_code: string;
  sms_template_param: string;
  sms_region_id: string;
  tencent_secret_id: string;
  tencent_secret_key: string;
  tencent_sdk_app_id: string;
  tencent_sign_name: string;
  tencent_template_id: string;
  tencent_template_params: string;
  tencent_region: string;
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_from_number: string;
  twilio_messaging_service_sid: string;
  notification_sms_template_id?: number;
};

type FormValidationErrorShape = {
  errorFields?: unknown;
};

interface NotificationSmsPanelProps {
  config: Record<string, string>;
  smsTemplateOptions: Array<{ value: number; label: string }>;
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

const NotificationSmsPanel: React.FC<NotificationSmsPanelProps> = ({
  config,
  smsTemplateOptions,
  onManageTemplate,
  onUpdated,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<SmsConfig>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const smsEnabled = Boolean(Form.useWatch('sms_enabled', form));
  const smsProvider = Form.useWatch('sms_provider', form) as SmsProvider | undefined;

  const secretPresence = useMemo(() => ({
    smsAccessKeySecret: (() => {
      const raw = String(config.sms_access_key_secret || '').trim();
      return raw === MASKED_VALUE || raw.length > 0;
    })(),
    tencentSecretKey: (() => {
      const raw = String(config.tencent_secret_key || '').trim();
      return raw === MASKED_VALUE || raw.length > 0;
    })(),
    twilioAuthToken: (() => {
      const raw = String(config.twilio_auth_token || '').trim();
      return raw === MASKED_VALUE || raw.length > 0;
    })(),
  }), [config]);

  useEffect(() => {
    const smsProviderValue = (config.sms_provider || '') as SmsProvider | '';
    form.setFieldsValue({
      sms_enabled: (config.sms_enabled || 'false') === 'true',
      sms_provider: smsProviderValue || undefined,
      sms_test_phone: config.sms_test_phone || '',
      sms_test_message: config.sms_test_message || t('notificationServices.sms.defaultTestMessage'),
      sms_access_key_id: config.sms_access_key_id || '',
      sms_access_key_secret: String(config.sms_access_key_secret || '').trim() === MASKED_VALUE ? '' : (config.sms_access_key_secret || ''),
      sms_sign_name: config.sms_sign_name || '',
      sms_template_code: config.sms_template_code || '',
      sms_template_param: config.sms_template_param || '{"code":"123456"}',
      sms_region_id: config.sms_region_id || 'cn-hangzhou',
      tencent_secret_id: config.tencent_secret_id || '',
      tencent_secret_key: String(config.tencent_secret_key || '').trim() === MASKED_VALUE ? '' : (config.tencent_secret_key || ''),
      tencent_sdk_app_id: config.tencent_sdk_app_id || '',
      tencent_sign_name: config.tencent_sign_name || '',
      tencent_template_id: config.tencent_template_id || '',
      tencent_template_params: config.tencent_template_params || '123456',
      tencent_region: config.tencent_region || 'ap-guangzhou',
      twilio_account_sid: config.twilio_account_sid || '',
      twilio_auth_token: String(config.twilio_auth_token || '').trim() === MASKED_VALUE ? '' : (config.twilio_auth_token || ''),
      twilio_from_number: config.twilio_from_number || '',
      twilio_messaging_service_sid: config.twilio_messaging_service_sid || '',
      notification_sms_template_id: config.notification_sms_template_id ? Number(config.notification_sms_template_id) : undefined,
    });
  }, [config, form, t]);

  const validateSmsProviderConfig = (values: SmsConfig): string | null => {
    if (!values.sms_enabled) return null;
    if (!values.sms_provider) return t('notificationServices.sms.validation.providerRequired');
    if (values.sms_provider === 'aliyun') {
      const hasSecret = Boolean(values.sms_access_key_secret || secretPresence.smsAccessKeySecret);
      if (!values.sms_access_key_id || !hasSecret || !values.sms_sign_name || !values.sms_template_code) {
        return t('notificationServices.sms.validation.aliyunRequired');
      }
    }
    if (values.sms_provider === 'tencent') {
      const hasSecret = Boolean(values.tencent_secret_key || secretPresence.tencentSecretKey);
      if (!values.tencent_secret_id || !hasSecret || !values.tencent_sdk_app_id || !values.tencent_sign_name || !values.tencent_template_id) {
        return t('notificationServices.sms.validation.tencentRequired');
      }
    }
    if (values.sms_provider === 'twilio') {
      const hasSecret = Boolean(values.twilio_auth_token || secretPresence.twilioAuthToken);
      if (!values.twilio_account_sid || !hasSecret || (!values.twilio_from_number && !values.twilio_messaging_service_sid)) {
        return t('notificationServices.sms.validation.twilioRequired');
      }
    }
    return null;
  };

  const handleSave = async () => {
    try {
      const values = smsEnabled
        ? await form.validateFields()
        : form.getFieldsValue(true);
      const validationError = validateSmsProviderConfig(values as SmsConfig);
      if (validationError) {
        message.error(validationError);
        return;
      }
      setSaving(true);
      const resolvedValues = values as SmsConfig;
      const pairs: Record<string, string> = {
        sms_enabled: resolvedValues.sms_enabled ? 'true' : 'false',
        sms_provider: resolvedValues.sms_provider || '',
        sms_test_phone: resolvedValues.sms_test_phone || '',
        sms_test_message: resolvedValues.sms_provider === 'twilio' ? (resolvedValues.sms_test_message || '') : '',
        sms_access_key_id: resolvedValues.sms_access_key_id || '',
        sms_sign_name: resolvedValues.sms_sign_name || '',
        sms_template_code: resolvedValues.sms_template_code || '',
        sms_template_param: resolvedValues.sms_template_param || '',
        sms_region_id: resolvedValues.sms_region_id || '',
        notification_sms_template_id: resolvedValues.notification_sms_template_id ? String(resolvedValues.notification_sms_template_id) : '',
        tencent_secret_id: resolvedValues.tencent_secret_id || '',
        tencent_sdk_app_id: resolvedValues.tencent_sdk_app_id || '',
        tencent_sign_name: resolvedValues.tencent_sign_name || '',
        tencent_template_id: resolvedValues.tencent_template_id || '',
        tencent_template_params: resolvedValues.tencent_template_params || '',
        tencent_region: resolvedValues.tencent_region || '',
        twilio_account_sid: resolvedValues.twilio_account_sid || '',
        twilio_from_number: resolvedValues.twilio_from_number || '',
        twilio_messaging_service_sid: resolvedValues.twilio_messaging_service_sid || '',
      };
      if (resolvedValues.sms_access_key_secret) {
        pairs.sms_access_key_secret = resolvedValues.sms_access_key_secret;
      } else if (!secretPresence.smsAccessKeySecret) {
        pairs.sms_access_key_secret = '';
      }
      if (resolvedValues.tencent_secret_key) {
        pairs.tencent_secret_key = resolvedValues.tencent_secret_key;
      } else if (!secretPresence.tencentSecretKey) {
        pairs.tencent_secret_key = '';
      }
      if (resolvedValues.twilio_auth_token) {
        pairs.twilio_auth_token = resolvedValues.twilio_auth_token;
      } else if (!secretPresence.twilioAuthToken) {
        pairs.twilio_auth_token = '';
      }
      await ApiClient.updateSystemConfig(pairs);
      await onUpdated();
      message.success(t('notificationServices.messages.smsSaved'));
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
      const values = form.getFieldsValue() as SmsConfig;
      if (!values.sms_test_phone) {
        message.error(t('notificationServices.sms.validation.testPhoneRequired'));
        return;
      }
      const validationError = validateSmsProviderConfig(values);
      if (validationError) {
        message.error(validationError);
        return;
      }
      await ApiClient.testSms({
        provider: values.sms_provider,
        test_phone: values.sms_test_phone,
        test_message: values.sms_provider === 'twilio' ? (values.sms_test_message || undefined) : undefined,
        template_id: values.notification_sms_template_id || undefined,
        sms_access_key_id: values.sms_access_key_id || undefined,
        sms_access_key_secret: values.sms_access_key_secret || undefined,
        sms_sign_name: values.sms_sign_name || undefined,
        sms_template_code: values.sms_template_code || undefined,
        sms_template_param: values.sms_template_param || undefined,
        sms_region_id: values.sms_region_id || undefined,
        tencent_secret_id: values.tencent_secret_id || undefined,
        tencent_secret_key: values.tencent_secret_key || undefined,
        tencent_sdk_app_id: values.tencent_sdk_app_id || undefined,
        tencent_sign_name: values.tencent_sign_name || undefined,
        tencent_template_id: values.tencent_template_id || undefined,
        tencent_template_params: values.tencent_template_params || undefined,
        tencent_region: values.tencent_region || undefined,
        twilio_account_sid: values.twilio_account_sid || undefined,
        twilio_auth_token: values.twilio_auth_token || undefined,
        twilio_from_number: values.twilio_from_number || undefined,
        twilio_messaging_service_sid: values.twilio_messaging_service_sid || undefined,
      });
      message.success(t('notificationServices.messages.smsTestSuccess'));
    } catch (error: unknown) {
      message.error(resolveErrorMessage(error, t('notificationServices.messages.smsTestFailed')));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="admin-card">
      <AppForm
        form={form}
        layout="vertical"
        className="max-w-3xl"
        initialValues={{
          sms_enabled: false,
          sms_template_param: '{"code":"123456"}',
          sms_region_id: 'cn-hangzhou',
          tencent_region: 'ap-guangzhou',
          tencent_template_params: '123456',
          sms_test_message: t('notificationServices.sms.defaultTestMessage'),
        }}
      >
        <Form.Item
          name="sms_enabled"
          label={<span className="font-semibold">{t('notificationServices.sms.fields.enabled')}</span>}
          valuePropName="checked"
        >
          <Switch
            checkedChildren={t('notificationServices.labels.enabled')}
            unCheckedChildren={t('notificationServices.labels.disabled')}
          />
        </Form.Item>

        {smsEnabled ? (
          <>
            <div className="grid grid-cols-2 gap-x-6">
              <Form.Item
                name="sms_provider"
                label={<span className="font-semibold">{t('notificationServices.sms.fields.provider')}</span>}
                rules={[{ required: true, message: t('notificationServices.sms.validation.providerRequired') }]}
              >
                <Select
                  placeholder={t('notificationServices.sms.placeholders.provider')}
                  options={[
                    { value: 'aliyun', label: t('notificationServices.sms.providers.aliyun') },
                    { value: 'tencent', label: t('notificationServices.sms.providers.tencent') },
                    { value: 'twilio', label: t('notificationServices.sms.providers.twilio') },
                  ]}
                />
              </Form.Item>
            </div>

            <Form.Item shouldUpdate noStyle>
              {() => {
                const provider = form.getFieldValue('sms_provider') as SmsProvider | undefined;
                if (provider === 'aliyun') {
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-x-6">
                        <Form.Item name="sms_access_key_id" label={<span className="font-semibold">{t('notificationServices.sms.fields.aliyunAccessKeyId')}</span>}>
                          <Input placeholder={t('notificationServices.sms.placeholders.aliyunAccessKeyId')} />
                        </Form.Item>
                        <Form.Item name="sms_access_key_secret" label={<span className="font-semibold">{t('notificationServices.sms.fields.aliyunAccessKeySecret')}</span>}>
                          <Input.Password placeholder={t('notificationServices.sms.placeholders.aliyunAccessKeySecret')} />
                        </Form.Item>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6">
                        <Form.Item name="sms_sign_name" label={<span className="font-semibold">{t('notificationServices.sms.fields.aliyunSignName')}</span>}>
                          <Input placeholder={t('notificationServices.sms.placeholders.aliyunSignName')} />
                        </Form.Item>
                        <Form.Item name="sms_template_code" label={<span className="font-semibold">{t('notificationServices.sms.fields.aliyunTemplateCode')}</span>}>
                          <Input placeholder={t('notificationServices.sms.placeholders.aliyunTemplateCode')} />
                        </Form.Item>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6">
                        <Form.Item name="sms_region_id" label={<span className="font-semibold">{t('notificationServices.sms.fields.aliyunRegion')}</span>}>
                          <Input placeholder="cn-hangzhou" />
                        </Form.Item>
                        <Form.Item name="sms_template_param" label={<span className="font-semibold">{t('notificationServices.sms.fields.aliyunTemplateParam')}</span>} help={t('notificationServices.sms.help.aliyunTemplateParam')}>
                          <Input placeholder='{"code":"123456"}' />
                        </Form.Item>
                      </div>
                    </>
                  );
                }
                if (provider === 'tencent') {
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-x-6">
                        <Form.Item name="tencent_secret_id" label={<span className="font-semibold">{t('notificationServices.sms.fields.tencentSecretId')}</span>}>
                          <Input placeholder={t('notificationServices.sms.placeholders.tencentSecretId')} />
                        </Form.Item>
                        <Form.Item name="tencent_secret_key" label={<span className="font-semibold">{t('notificationServices.sms.fields.tencentSecretKey')}</span>}>
                          <Input.Password placeholder={t('notificationServices.sms.placeholders.tencentSecretKey')} />
                        </Form.Item>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6">
                        <Form.Item name="tencent_sdk_app_id" label={<span className="font-semibold">{t('notificationServices.sms.fields.tencentSdkAppId')}</span>}>
                          <Input placeholder={t('notificationServices.sms.placeholders.tencentSdkAppId')} />
                        </Form.Item>
                        <Form.Item name="tencent_sign_name" label={<span className="font-semibold">{t('notificationServices.sms.fields.tencentSignName')}</span>}>
                          <Input placeholder={t('notificationServices.sms.placeholders.tencentSignName')} />
                        </Form.Item>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6">
                        <Form.Item name="tencent_template_id" label={<span className="font-semibold">{t('notificationServices.sms.fields.tencentTemplateId')}</span>}>
                          <Input placeholder={t('notificationServices.sms.placeholders.tencentTemplateId')} />
                        </Form.Item>
                        <Form.Item name="tencent_template_params" label={<span className="font-semibold">{t('notificationServices.sms.fields.tencentTemplateParams')}</span>} help={t('notificationServices.sms.help.tencentTemplateParams')}>
                          <Input placeholder="123456" />
                        </Form.Item>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6">
                        <Form.Item name="tencent_region" label={<span className="font-semibold">{t('notificationServices.sms.fields.tencentRegion')}</span>}>
                          <Input placeholder="ap-guangzhou" />
                        </Form.Item>
                      </div>
                    </>
                  );
                }
                if (provider === 'twilio') {
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-x-6">
                        <Form.Item name="twilio_account_sid" label={<span className="font-semibold">{t('notificationServices.sms.fields.twilioAccountSid')}</span>}>
                          <Input placeholder={t('notificationServices.sms.placeholders.twilioAccountSid')} />
                        </Form.Item>
                        <Form.Item name="twilio_auth_token" label={<span className="font-semibold">{t('notificationServices.sms.fields.twilioAuthToken')}</span>}>
                          <Input.Password placeholder={t('notificationServices.sms.placeholders.twilioAuthToken')} />
                        </Form.Item>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6">
                        <Form.Item name="twilio_from_number" label={<span className="font-semibold">{t('notificationServices.sms.fields.twilioFromNumber')}</span>} help={t('notificationServices.sms.help.twilioFromNumber')}>
                          <Input placeholder="+1234567890" />
                        </Form.Item>
                        <Form.Item name="twilio_messaging_service_sid" label={<span className="font-semibold">{t('notificationServices.sms.fields.twilioMessagingServiceSid')}</span>}>
                          <Input placeholder={t('notificationServices.sms.placeholders.twilioMessagingServiceSid')} />
                        </Form.Item>
                      </div>
                    </>
                  );
                }
                return (
                  <Alert
                    type="info"
                    showIcon
                    message={t('notificationServices.sms.selectProviderFirst')}
                    className="mb-4"
                  />
                );
              }}
            </Form.Item>

            <div className="grid grid-cols-2 gap-x-6">
              <Form.Item
                name="sms_test_phone"
                label={<span className="font-semibold">{t('notificationServices.sms.fields.testPhone')}</span>}
                rules={[{ required: true, message: t('notificationServices.sms.validation.testPhoneRequired') }]}
              >
                <Input placeholder={t('notificationServices.sms.placeholders.testPhone')} />
              </Form.Item>
              {smsProvider === 'twilio' ? (
                <Form.Item
                  name="sms_test_message"
                  label={<span className="font-semibold">{t('notificationServices.sms.fields.testMessage')}</span>}
                  help={t('notificationServices.sms.help.testMessage')}
                >
                  <Input placeholder={t('notificationServices.sms.placeholders.testMessage')} />
                </Form.Item>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-x-6">
              <Form.Item
                name="notification_sms_template_id"
                label={<span className="font-semibold">{t('notificationServices.templates.smsTemplate')}</span>}
                help={t('notificationServices.templates.smsTemplateHelp')}
              >
                <Select
                  allowClear
                  options={smsTemplateOptions}
                  placeholder={t('notificationServices.templates.smsTemplatePlaceholder')}
                  notFoundContent={t('notificationServices.templates.empty')}
                />
              </Form.Item>
            </div>
            <AppButton intent="tertiary" onClick={onManageTemplate}>
              {t('notificationServices.templates.manageSms')}
            </AppButton>
            <Divider />
          </>
        ) : null}
        <Space>
          <AppButton intent="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            {t('notificationServices.actions.save')}
          </AppButton>
          <AppButton icon={<SendOutlined />} onClick={handleTest} loading={testing} disabled={!smsEnabled}>
            {t('notificationServices.actions.sendTest')}
          </AppButton>
        </Space>
      </AppForm>
    </Card>
  );
};

export default NotificationSmsPanel;
