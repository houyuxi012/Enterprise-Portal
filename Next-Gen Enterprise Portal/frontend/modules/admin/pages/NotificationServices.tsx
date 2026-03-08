import React, { useState, useEffect } from 'react';
import { Alert, Card, Form, Input, InputNumber, Switch, Button, message, Tabs, Divider, Tag, Space, Select } from 'antd';
import { MailOutlined, MessageOutlined, ReloadOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';

interface SmtpConfig {
    smtp_host: string;
    smtp_port: number;
    smtp_username: string;
    smtp_password: string;
    smtp_use_tls: boolean;
    smtp_sender: string;
}

interface TelegramConfig {
    telegram_bot_enabled: boolean;
    telegram_bot_token: string;
    telegram_chat_id: string;
    telegram_parse_mode: string;
    telegram_disable_web_page_preview: boolean;
    telegram_test_message: string;
}

type SmsProvider = 'aliyun' | 'tencent' | 'twilio';

interface SmsConfig {
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
}

interface NotificationHealthState {
    overall_status: string;
    channels: {
        smtp: { enabled: boolean; configured: boolean; status: string; sender?: string };
        telegram: { enabled: boolean; configured: boolean; status: string };
        sms: { enabled: boolean; configured: boolean; status: string; provider?: string };
    };
}

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

const hasFormValidationErrors = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') {
        return false;
    }
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

const MASKED_VALUE = '__MASKED__';

const isMaskedValue = (value: unknown): boolean => String(value ?? '').trim() === MASKED_VALUE;

const NotificationServices: React.FC = () => {
    const { t } = useTranslation();
    const [smtpForm] = Form.useForm();
    const [telegramForm] = Form.useForm();
    const [smsForm] = Form.useForm();
    const [smtpSaving, setSmtpSaving] = useState(false);
    const [smtpTesting, setSmtpTesting] = useState(false);
    const [telegramSaving, setTelegramSaving] = useState(false);
    const [telegramTesting, setTelegramTesting] = useState(false);
    const [smsSaving, setSmsSaving] = useState(false);
    const [smsTesting, setSmsTesting] = useState(false);
    const [healthLoading, setHealthLoading] = useState(false);
    const [smtpConfigured, setSmtpConfigured] = useState(false);
    const [telegramConfigured, setTelegramConfigured] = useState(false);
    const [smsConfigured, setSmsConfigured] = useState(false);
    const [health, setHealth] = useState<NotificationHealthState | null>(null);
    const [secretPresence, setSecretPresence] = useState({
        smtpPassword: false,
        telegramBotToken: false,
        smsAccessKeySecret: false,
        tencentSecretKey: false,
        twilioAuthToken: false,
    });

    useEffect(() => {
        loadNotificationConfig();
    }, []);

    const loadNotificationConfig = async () => {
        try {
            const data = await ApiClient.getSystemConfig();
            const config = data;
            const host = config['smtp_host'] || '';
            const smtpPasswordMasked = isMaskedValue(config['smtp_password']);
            const telegramTokenMasked = isMaskedValue(config['telegram_bot_token']);
            const aliyunSecretMasked = isMaskedValue(config['sms_access_key_secret']);
            const tencentSecretMasked = isMaskedValue(config['tencent_secret_key']);
            const twilioSecretMasked = isMaskedValue(config['twilio_auth_token']);
            const telegramToken = telegramTokenMasked ? '' : (config['telegram_bot_token'] || '');
            const telegramChatId = config['telegram_chat_id'] || '';
            smtpForm.setFieldsValue({
                smtp_host: host,
                smtp_port: parseInt(config['smtp_port'] || '587'),
                smtp_username: config['smtp_username'] || '',
                smtp_password: smtpPasswordMasked ? '' : (config['smtp_password'] || ''),
                smtp_use_tls: (config['smtp_use_tls'] || 'true') === 'true',
                smtp_sender: config['smtp_sender'] || config['smtp_username'] || '',
                smtp_test_email: config['smtp_test_email'] || config['smtp_sender'] || config['smtp_username'] || '',
            });
            telegramForm.setFieldsValue({
                telegram_bot_enabled: (config['telegram_bot_enabled'] || 'false') === 'true',
                telegram_bot_token: telegramToken,
                telegram_chat_id: telegramChatId,
                telegram_parse_mode: config['telegram_parse_mode'] || 'none',
                telegram_disable_web_page_preview: (config['telegram_disable_web_page_preview'] || 'true') === 'true',
                telegram_test_message: t('notificationServices.telegram.defaultTestMessage'),
            });
            const smsProvider = (config['sms_provider'] || '') as SmsProvider | '';
            smsForm.setFieldsValue({
                sms_enabled: (config['sms_enabled'] || 'false') === 'true',
                sms_provider: smsProvider || undefined,
                sms_test_phone: config['sms_test_phone'] || '',
                sms_test_message: config['sms_test_message'] || t('notificationServices.sms.defaultTestMessage'),
                sms_access_key_id: config['sms_access_key_id'] || '',
                sms_access_key_secret: aliyunSecretMasked ? '' : (config['sms_access_key_secret'] || ''),
                sms_sign_name: config['sms_sign_name'] || '',
                sms_template_code: config['sms_template_code'] || '',
                sms_template_param: config['sms_template_param'] || '{"code":"123456"}',
                sms_region_id: config['sms_region_id'] || 'cn-hangzhou',
                tencent_secret_id: config['tencent_secret_id'] || '',
                tencent_secret_key: tencentSecretMasked ? '' : (config['tencent_secret_key'] || ''),
                tencent_sdk_app_id: config['tencent_sdk_app_id'] || '',
                tencent_sign_name: config['tencent_sign_name'] || '',
                tencent_template_id: config['tencent_template_id'] || '',
                tencent_template_params: config['tencent_template_params'] || '123456',
                tencent_region: config['tencent_region'] || 'ap-guangzhou',
                twilio_account_sid: config['twilio_account_sid'] || '',
                twilio_auth_token: twilioSecretMasked ? '' : (config['twilio_auth_token'] || ''),
                twilio_from_number: config['twilio_from_number'] || '',
                twilio_messaging_service_sid: config['twilio_messaging_service_sid'] || '',
            });
            setSecretPresence({
                smtpPassword: smtpPasswordMasked || Boolean(config['smtp_password']),
                telegramBotToken: telegramTokenMasked || Boolean(config['telegram_bot_token']),
                smsAccessKeySecret: aliyunSecretMasked || Boolean(config['sms_access_key_secret']),
                tencentSecretKey: tencentSecretMasked || Boolean(config['tencent_secret_key']),
                twilioAuthToken: twilioSecretMasked || Boolean(config['twilio_auth_token']),
            });
            setSmtpConfigured(!!host);
            setTelegramConfigured(Boolean((telegramToken || telegramTokenMasked) && telegramChatId));
            setSmsConfigured(Boolean(
                (smsProvider === 'aliyun' && config['sms_access_key_id'] && (config['sms_access_key_secret'] || aliyunSecretMasked) && config['sms_sign_name'] && config['sms_template_code']) ||
                (smsProvider === 'tencent' && config['tencent_secret_id'] && (config['tencent_secret_key'] || tencentSecretMasked) && config['tencent_sdk_app_id'] && config['tencent_sign_name'] && config['tencent_template_id']) ||
                (smsProvider === 'twilio' && config['twilio_account_sid'] && (config['twilio_auth_token'] || twilioSecretMasked) && (config['twilio_from_number'] || config['twilio_messaging_service_sid']))
            ));
            await loadNotificationHealth();
        } catch {
            // ignore
        }
    };

    const loadNotificationHealth = async () => {
        setHealthLoading(true);
        try {
            const data = await ApiClient.getNotificationHealth();
            setHealth(data);
        } catch {
            // ignore
        } finally {
            setHealthLoading(false);
        }
    };

    const handleSaveSmtp = async () => {
        try {
            const values = await smtpForm.validateFields();
            setSmtpSaving(true);
            // Save each field as system config
            const pairs: Record<string, string> = {
                smtp_host: values.smtp_host,
                smtp_port: String(values.smtp_port),
                smtp_username: values.smtp_username,
                smtp_use_tls: values.smtp_use_tls ? 'true' : 'false',
                smtp_sender: values.smtp_sender || values.smtp_username,
                smtp_test_email: values.smtp_test_email || '',
            };
            if (values.smtp_password) {
                pairs.smtp_password = values.smtp_password;
            } else if (!secretPresence.smtpPassword) {
                pairs.smtp_password = '';
            }
            await ApiClient.updateSystemConfig(pairs);
            message.success(t('notificationServices.messages.smtpSaved'));
            setSmtpConfigured(true);
            setSecretPresence((prev) => ({ ...prev, smtpPassword: prev.smtpPassword || Boolean(values.smtp_password) }));
            await loadNotificationHealth();
        } catch (err: unknown) {
            if (hasFormValidationErrors(err)) return; // form validation
            message.error(t('notificationServices.messages.saveFailed'));
        } finally {
            setSmtpSaving(false);
        }
    };

    const handleTestSmtp = async () => {
        setSmtpTesting(true);
        try {
            const values = smtpForm.getFieldsValue();
            const toEmail = values.smtp_test_email;
            if (!toEmail) {
                message.error(t('notificationServices.smtp.validation.testEmailRequired'));
                setSmtpTesting(false);
                return;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
                message.error(t('notificationServices.smtp.validation.testEmailInvalid'));
                setSmtpTesting(false);
                return;
            }
            await ApiClient.testSmtp(toEmail);
            message.success(t('notificationServices.messages.smtpTestSuccess'));
        } catch (err: unknown) {
            message.error(resolveErrorMessage(err, t('notificationServices.messages.smtpTestFailed')));
        } finally {
            setSmtpTesting(false);
        }
    };

    const handleSaveTelegram = async () => {
        try {
            const values = await telegramForm.validateFields() as TelegramConfig;
            const hasToken = Boolean(values.telegram_bot_token || secretPresence.telegramBotToken);
            if (values.telegram_bot_enabled && (!hasToken || !values.telegram_chat_id)) {
                message.error(t('notificationServices.telegram.validation.tokenAndChatRequiredWhenEnabled'));
                return;
            }
            setTelegramSaving(true);
            const pairs: Record<string, string> = {
                telegram_bot_enabled: values.telegram_bot_enabled ? 'true' : 'false',
                telegram_chat_id: values.telegram_chat_id || '',
                telegram_parse_mode: values.telegram_parse_mode || 'MarkdownV2',
                telegram_disable_web_page_preview: values.telegram_disable_web_page_preview ? 'true' : 'false',
            };
            if (values.telegram_bot_token) {
                pairs.telegram_bot_token = values.telegram_bot_token;
            } else if (!secretPresence.telegramBotToken) {
                pairs.telegram_bot_token = '';
            }
            await ApiClient.updateSystemConfig(pairs);
            setTelegramConfigured(Boolean((values.telegram_bot_token || secretPresence.telegramBotToken) && values.telegram_chat_id));
            setSecretPresence((prev) => ({
                ...prev,
                telegramBotToken: prev.telegramBotToken || Boolean(values.telegram_bot_token),
            }));
            message.success(t('notificationServices.messages.telegramSaved'));
            await loadNotificationHealth();
        } catch (err: unknown) {
            if (hasFormValidationErrors(err)) return;
            message.error(t('notificationServices.messages.saveFailed'));
        } finally {
            setTelegramSaving(false);
        }
    };

    const handleTestTelegram = async () => {
        setTelegramTesting(true);
        try {
            const values = telegramForm.getFieldsValue() as TelegramConfig;
            await ApiClient.testTelegramBot({
                bot_token: values.telegram_bot_token || undefined,
                chat_id: values.telegram_chat_id || undefined,
                parse_mode: values.telegram_parse_mode || undefined,
                disable_web_page_preview: Boolean(values.telegram_disable_web_page_preview),
                message: values.telegram_test_message || t('notificationServices.telegram.defaultTestMessage'),
            });
            message.success(t('notificationServices.messages.telegramTestSuccess'));
        } catch (err: unknown) {
            message.error(resolveErrorMessage(err, t('notificationServices.messages.telegramTestFailed')));
        } finally {
            setTelegramTesting(false);
        }
    };

    const validateSmsProviderConfig = (values: SmsConfig): string | null => {
        if (!values.sms_provider) {
            return t('notificationServices.sms.validation.providerRequired');
        }
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

    const handleSaveSms = async () => {
        try {
            const values = await smsForm.validateFields() as SmsConfig;
            const validationError = validateSmsProviderConfig(values);
            if (validationError) {
                message.error(validationError);
                return;
            }
            setSmsSaving(true);
            const pairs: Record<string, string> = {
                sms_enabled: values.sms_enabled ? 'true' : 'false',
                sms_provider: values.sms_provider,
                sms_test_phone: values.sms_test_phone || '',
                sms_test_message: values.sms_test_message || '',
                sms_access_key_id: values.sms_access_key_id || '',
                sms_sign_name: values.sms_sign_name || '',
                sms_template_code: values.sms_template_code || '',
                sms_template_param: values.sms_template_param || '',
                sms_region_id: values.sms_region_id || '',
                tencent_secret_id: values.tencent_secret_id || '',
                tencent_sdk_app_id: values.tencent_sdk_app_id || '',
                tencent_sign_name: values.tencent_sign_name || '',
                tencent_template_id: values.tencent_template_id || '',
                tencent_template_params: values.tencent_template_params || '',
                tencent_region: values.tencent_region || '',
                twilio_account_sid: values.twilio_account_sid || '',
                twilio_from_number: values.twilio_from_number || '',
                twilio_messaging_service_sid: values.twilio_messaging_service_sid || '',
            };
            if (values.sms_access_key_secret) {
                pairs.sms_access_key_secret = values.sms_access_key_secret;
            } else if (!secretPresence.smsAccessKeySecret) {
                pairs.sms_access_key_secret = '';
            }
            if (values.tencent_secret_key) {
                pairs.tencent_secret_key = values.tencent_secret_key;
            } else if (!secretPresence.tencentSecretKey) {
                pairs.tencent_secret_key = '';
            }
            if (values.twilio_auth_token) {
                pairs.twilio_auth_token = values.twilio_auth_token;
            } else if (!secretPresence.twilioAuthToken) {
                pairs.twilio_auth_token = '';
            }
            await ApiClient.updateSystemConfig(pairs);
            setSmsConfigured(true);
            setSecretPresence((prev) => ({
                ...prev,
                smsAccessKeySecret: prev.smsAccessKeySecret || Boolean(values.sms_access_key_secret),
                tencentSecretKey: prev.tencentSecretKey || Boolean(values.tencent_secret_key),
                twilioAuthToken: prev.twilioAuthToken || Boolean(values.twilio_auth_token),
            }));
            message.success(t('notificationServices.messages.smsSaved'));
            await loadNotificationHealth();
        } catch (err: unknown) {
            if (hasFormValidationErrors(err)) return;
            message.error(t('notificationServices.messages.saveFailed'));
        } finally {
            setSmsSaving(false);
        }
    };

    const handleTestSms = async () => {
        setSmsTesting(true);
        try {
            const values = smsForm.getFieldsValue() as SmsConfig;
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
                test_message: values.sms_test_message || undefined,
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
        } catch (err: unknown) {
            message.error(resolveErrorMessage(err, t('notificationServices.messages.smsTestFailed')));
        } finally {
            setSmsTesting(false);
        }
    };

    const getHealthTagColor = (status?: string): string => {
        if (status === 'healthy') return 'green';
        if (status === 'degraded' || status === 'misconfigured') return 'orange';
        if (status === 'disabled' || status === 'not_configured') return 'default';
        return 'default';
    };

    return (
        <div>
            <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-800">{t('notificationServices.title')}</h2>
                <p className="text-sm text-slate-500 mt-1">{t('notificationServices.subtitle')}</p>
            </div>


            <Tabs
                items={[
                    {
                        key: 'smtp',
                        label: (
                            <span className="flex items-center space-x-2">
                                <MailOutlined />
                                <span>{t('notificationServices.tabs.smtp')}</span>
                                {smtpConfigured && <Tag color="green" className="ml-2">{t('notificationServices.labels.configured')}</Tag>}
                            </span>
                        ),
                        children: (
                            <Card className="shadow-sm border-slate-200">
                                <Form
                                    form={smtpForm}
                                    layout="vertical"
                                    className="max-w-2xl"
                                    initialValues={{
                                        smtp_port: 587,
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
                                            <InputNumber min={1} max={65535} className="w-full" placeholder="587" />
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
                                            rules={[{ required: true, message: t('notificationServices.smtp.validation.passwordRequired') }]}
                                        >
                                            <Input.Password placeholder={t('notificationServices.smtp.placeholders.password')} />
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
                                                { type: 'email', message: t('notificationServices.smtp.validation.testEmailInvalid') }
                                            ]}
                                        >
                                            <Input placeholder={t('notificationServices.smtp.placeholders.testEmail')} />
                                        </Form.Item>
                                    </div>
                                    <Divider />
                                    <Space>
                                        <Button
                                            type="primary"
                                            icon={<SaveOutlined />}
                                            onClick={handleSaveSmtp}
                                            loading={smtpSaving}
                                        >
                                            {t('notificationServices.actions.save')}
                                        </Button>
                                        <Button
                                            icon={<SendOutlined />}
                                            onClick={handleTestSmtp}
                                            loading={smtpTesting}
                                        >
                                            {t('notificationServices.actions.sendTest')}
                                        </Button>
                                    </Space>
                                </Form>
                            </Card>
                        ),
                    },
                    {
                        key: 'telegram',
                        label: (
                            <span className="flex items-center space-x-2">
                                <SendOutlined />
                                <span>{t('notificationServices.tabs.telegram')}</span>
                                {telegramConfigured && <Tag color="green" className="ml-2">{t('notificationServices.labels.configured')}</Tag>}
                            </span>
                        ),
                        children: (
                            <Card className="shadow-sm border-slate-200">
                                <Form
                                    form={telegramForm}
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
                                            rules={[{ required: true, message: t('notificationServices.telegram.validation.botTokenRequired') }]}
                                        >
                                            <Input.Password placeholder={t('notificationServices.telegram.placeholders.botToken')} />
                                        </Form.Item>
                                        <Form.Item
                                            name="telegram_chat_id"
                                            label={<span className="font-semibold">{t('notificationServices.telegram.fields.chatId')}</span>}
                                            rules={[{ required: true, message: t('notificationServices.telegram.validation.chatIdRequired') }]}
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
                                    </div>
                                    <Form.Item
                                        name="telegram_test_message"
                                        label={<span className="font-semibold">{t('notificationServices.telegram.fields.testMessage')}</span>}
                                        help={t('notificationServices.telegram.help.testMessage')}
                                    >
                                        <Input.TextArea rows={3} maxLength={500} placeholder={t('notificationServices.telegram.placeholders.testMessage')} />
                                    </Form.Item>
                                    <Divider />
                                    <Space>
                                        <Button
                                            type="primary"
                                            icon={<SaveOutlined />}
                                            onClick={handleSaveTelegram}
                                            loading={telegramSaving}
                                        >
                                            {t('notificationServices.actions.save')}
                                        </Button>
                                        <Button
                                            icon={<SendOutlined />}
                                            onClick={handleTestTelegram}
                                            loading={telegramTesting}
                                        >
                                            {t('notificationServices.actions.sendTest')}
                                        </Button>
                                    </Space>
                                </Form>
                            </Card>
                        ),
                    },
                    {
                        key: 'sms',
                        label: (
                            <span className="flex items-center space-x-2">
                                <MessageOutlined />
                                <span>{t('notificationServices.tabs.sms')}</span>
                                {smsConfigured && <Tag color="green" className="ml-2">{t('notificationServices.labels.configured')}</Tag>}
                            </span>
                        ),
                        children: (
                            <Card className="shadow-sm border-slate-200">
                                <Form
                                    form={smsForm}
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
                                    <div className="grid grid-cols-2 gap-x-6">
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
                                            const provider = smsForm.getFieldValue('sms_provider') as SmsProvider | undefined;
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
                                                <>
                                                    <Alert
                                                        type="info"
                                                        showIcon
                                                        message={t('notificationServices.sms.selectProviderFirst')}
                                                        className="mb-4"
                                                    />
                                                </>
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
                                        <Form.Item
                                            name="sms_test_message"
                                            label={<span className="font-semibold">{t('notificationServices.sms.fields.testMessage')}</span>}
                                            help={t('notificationServices.sms.help.testMessage')}
                                        >
                                            <Input placeholder={t('notificationServices.sms.placeholders.testMessage')} />
                                        </Form.Item>
                                    </div>
                                    <Divider />
                                    <Space>
                                        <Button
                                            type="primary"
                                            icon={<SaveOutlined />}
                                            onClick={handleSaveSms}
                                            loading={smsSaving}
                                        >
                                            {t('notificationServices.actions.save')}
                                        </Button>
                                        <Button
                                            icon={<SendOutlined />}
                                            onClick={handleTestSms}
                                            loading={smsTesting}
                                        >
                                            {t('notificationServices.actions.sendTest')}
                                        </Button>
                                    </Space>
                                </Form>
                            </Card>
                        ),
                    },
                ]}
            />
        </div>
    );
};

export default NotificationServices;
