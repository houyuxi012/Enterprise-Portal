import React, { useState, useEffect } from 'react';
import { Form, Input, message, Switch, InputNumber, Divider, Select } from 'antd';
import { SaveOutlined, SafetyCertificateOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '../../services/api';
import AppButton from '../../components/AppButton';

const SecuritySettings: React.FC = () => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getSystemConfig();
                // Parse boolean/number values from string storage
                const formattedConfig = {
                    ...config,
                    security_mfa_enabled: config.security_mfa_enabled === 'true',
                    security_login_max_retries: config.security_login_max_retries ? parseInt(config.security_login_max_retries) : 5,
                    security_lockout_duration: config.security_lockout_duration ? parseInt(config.security_lockout_duration) : 15,
                    security_lockout_scope: ['account', 'ip'].includes((config.security_lockout_scope || '').toLowerCase())
                        ? (config.security_lockout_scope || '').toLowerCase()
                        : 'account',
                    max_concurrent_sessions: config.max_concurrent_sessions ? parseInt(config.max_concurrent_sessions) : 0,
                    login_session_timeout_minutes: config.login_session_timeout_minutes ? parseInt(config.login_session_timeout_minutes) : 30,
                    login_session_absolute_timeout_minutes: config.login_session_absolute_timeout_minutes
                        ? parseInt(config.login_session_absolute_timeout_minutes)
                        : 480,
                    login_captcha_threshold: config.login_captcha_threshold ? parseInt(config.login_captcha_threshold) : 3,
                    security_force_change_password_after_reset: config.security_force_change_password_after_reset === 'true',
                };

                form.setFieldsValue(formattedConfig);
            } catch (error) {
                message.error(t('securitySettingsPage.messages.loadFailed'));
            }
        };
        fetchConfig();
    }, [form, t]);

    const handleSave = async (values: any) => {
        setLoading(true);
        try {
            // Convert types back to string for storage
            const payload = {
                ...values,
                security_mfa_enabled: String(values.security_mfa_enabled),
                security_login_max_retries: String(values.security_login_max_retries),
                security_lockout_duration: String(values.security_lockout_duration),
                security_lockout_scope: String(values.security_lockout_scope || 'account'),
                max_concurrent_sessions: String(values.max_concurrent_sessions),
                login_session_timeout_minutes: String(values.login_session_timeout_minutes),
                login_session_absolute_timeout_minutes: String(values.login_session_absolute_timeout_minutes),
                login_captcha_threshold: String(values.login_captcha_threshold),
                security_force_change_password_after_reset: String(values.security_force_change_password_after_reset),
            };

            await ApiClient.updateSystemConfig(payload);
            message.success(t('securitySettingsPage.messages.saveSuccess'));
        } catch (error) {
            message.error(t('securitySettingsPage.messages.saveFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2 max-w-4xl mx-auto w-full">
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{t('securitySettingsPage.page.title')}</h2>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wide">{t('securitySettingsPage.page.subtitle')}</p>
                </div>
                <AppButton
                    intent="primary"
                    icon={<SaveOutlined />}
                    onClick={() => form.submit()}
                    loading={loading}
                >
                    {t('securitySettingsPage.page.saveButton')}
                </AppButton>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.25rem] p-6 shadow-sm border border-slate-100 dark:border-slate-700/50 max-w-4xl mx-auto animate-in slider-up duration-500">
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    className="space-y-5"
                    initialValues={{
                        security_login_max_retries: 5,
                        security_lockout_duration: 15,
                        security_lockout_scope: 'account',
                        security_mfa_enabled: false,
                        max_concurrent_sessions: 0,
                        login_session_timeout_minutes: 30,
                        login_session_absolute_timeout_minutes: 480,
                        login_captcha_threshold: 3,
                        security_force_change_password_after_reset: false,
                    }}
                >
                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">

                            <LockOutlined className="mr-2" /> {t('securitySettingsPage.sections.mfa')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Form.Item
                                name="security_mfa_enabled"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('securitySettingsPage.form.forceMfa')}</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>
                        </div>
                    </div>

                    <Divider className="my-2 border-slate-100 dark:border-slate-700" />

                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">

                            <SafetyCertificateOutlined className="mr-2" /> {t('securitySettingsPage.sections.loginProtection')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <Form.Item
                                name="security_login_max_retries"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('securitySettingsPage.form.maxRetries')}</span>}
                            >
                                <InputNumber min={3} max={10} className="w-full rounded-lg" size="middle" />
                            </Form.Item>

                            <Form.Item
                                name="security_lockout_duration"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('securitySettingsPage.form.lockoutDuration')}</span>}
                            >
                                <InputNumber min={5} max={1440} className="w-full rounded-lg" size="middle" />
                            </Form.Item>

                            <Form.Item
                                name="security_lockout_scope"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('securitySettingsPage.form.lockoutScope')}</span>}
                                help={<span className="text-[10px] text-slate-400">{t('securitySettingsPage.form.lockoutScopeHelp')}</span>}
                            >
                                <Select
                                    options={[
                                        { value: 'account', label: t('securitySettingsPage.form.options.lockByAccount') },
                                        { value: 'ip', label: t('securitySettingsPage.form.options.lockByIp') },
                                    ]}
                                    className="w-full"
                                />
                            </Form.Item>

                            <Form.Item
                                name="security_force_change_password_after_reset"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('securitySettingsPage.form.forceChangeAfterReset')}</span>}
                                help={<span className="text-[10px] text-slate-400">{t('securitySettingsPage.form.forceChangeAfterResetHelp')}</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>
                        </div>
                    </div>

                    <Divider className="my-2 border-slate-100 dark:border-slate-700" />

                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">
                            <SafetyCertificateOutlined className="mr-2" /> {t('securitySettingsPage.sections.sessionCaptcha')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                            <Form.Item
                                name="max_concurrent_sessions"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('securitySettingsPage.form.maxConcurrentSessions')}</span>}
                            >
                                <InputNumber min={0} max={100} className="w-full rounded-lg" size="middle" />
                            </Form.Item>

                            <Form.Item
                                name="login_session_timeout_minutes"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('securitySettingsPage.form.sessionTimeoutMinutes')}</span>}
                            >
                                <InputNumber min={5} max={43200} className="w-full rounded-lg" size="middle" />
                            </Form.Item>

                            <Form.Item
                                name="login_session_absolute_timeout_minutes"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('securitySettingsPage.form.absoluteTimeoutMinutes')}</span>}
                                help={<span className="text-[10px] text-slate-400">{t('securitySettingsPage.form.absoluteTimeoutHelp')}</span>}
                            >
                                <InputNumber min={5} max={43200} className="w-full rounded-lg" size="middle" />
                            </Form.Item>

                            <Form.Item
                                name="login_captcha_threshold"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('securitySettingsPage.form.captchaThreshold')}</span>}
                            >
                                <InputNumber min={1} max={20} className="w-full rounded-lg" size="middle" />
                            </Form.Item>
                        </div>
                    </div>

                    <Divider className="my-2 border-slate-100 dark:border-slate-700" />

                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">

                            <GlobalOutlined className="mr-2" /> {t('securitySettingsPage.sections.networkAccess')}
                        </h3>

                        <Form.Item
                            name="security_ip_allowlist"
                            label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('securitySettingsPage.form.ipAllowlist')}</span>}
                            help={<span className="text-[10px] text-slate-400">{t('securitySettingsPage.form.ipAllowlistHelp')}</span>}
                        >
                            <Input.TextArea
                                rows={2}
                                className="rounded-lg bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20 text-xs"
                                placeholder={t('securitySettingsPage.form.placeholders.ipAllowlist')}
                            />
                        </Form.Item>
                    </div>

                </Form>
            </div>
        </div>
    );
};

export default SecuritySettings;
