import React, { useState, useEffect } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Row from 'antd/es/grid/row';
import Select from 'antd/es/select';
import Switch from 'antd/es/switch';
import { SaveOutlined, SafetyCertificateOutlined, GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { AppButton, AppForm, AppPageHeader } from '@/modules/admin/components/ui';

type LockoutScope = 'account' | 'ip';

type SecuritySettingsFormValues = {
    security_login_max_retries: number;
    security_lockout_duration: number;
    security_lockout_scope: LockoutScope;
    max_concurrent_sessions: number;
    login_session_timeout_minutes: number;
    admin_session_timeout_minutes: number;
    login_session_absolute_timeout_minutes: number;
    login_captcha_threshold: number;
    security_ip_allowlist?: string;
};

const SecuritySettings: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [form] = AppForm.useForm<SecuritySettingsFormValues>();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getSystemConfig();
                // Parse boolean/number values from string storage
                const formattedConfig = {
                    ...config,

                    security_login_max_retries: config.security_login_max_retries ? parseInt(config.security_login_max_retries) : 5,
                    security_lockout_duration: config.security_lockout_duration ? parseInt(config.security_lockout_duration) : 15,
                    security_lockout_scope: ['account', 'ip'].includes((config.security_lockout_scope || '').toLowerCase())
                        ? ((config.security_lockout_scope || '').toLowerCase() as LockoutScope)
                        : 'account',
                    max_concurrent_sessions: config.max_concurrent_sessions ? parseInt(config.max_concurrent_sessions) : 0,
                    login_session_timeout_minutes: config.login_session_timeout_minutes ? parseInt(config.login_session_timeout_minutes) : 30,
                    admin_session_timeout_minutes: config.admin_session_timeout_minutes ? parseInt(config.admin_session_timeout_minutes) : 30,
                    login_session_absolute_timeout_minutes: config.login_session_absolute_timeout_minutes
                        ? parseInt(config.login_session_absolute_timeout_minutes)
                        : 480,
                    login_captcha_threshold: config.login_captcha_threshold ? parseInt(config.login_captcha_threshold) : 3,
                };

                form.setFieldsValue(formattedConfig);
            } catch (error) {
                message.error(t('securitySettingsPage.messages.loadFailed'));
            }
        };
        fetchConfig();
    }, [form, t]);

    const handleSave = async (values: SecuritySettingsFormValues) => {
        setLoading(true);
        try {
            // Convert types back to string for storage
            const payload = {
                ...values,

                security_login_max_retries: String(values.security_login_max_retries),
                security_lockout_duration: String(values.security_lockout_duration),
                security_lockout_scope: String(values.security_lockout_scope || 'account'),
                max_concurrent_sessions: String(values.max_concurrent_sessions),
                login_session_timeout_minutes: String(values.login_session_timeout_minutes),
                admin_session_timeout_minutes: String(values.admin_session_timeout_minutes),
                login_session_absolute_timeout_minutes: String(values.login_session_absolute_timeout_minutes),
                login_captcha_threshold: String(values.login_captcha_threshold),
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
        <div className="admin-page admin-page-spaced">
            <div className="mx-auto w-full max-w-4xl">
                <AppPageHeader
                    title={t('securitySettingsPage.page.title')}
                    subtitle={t('securitySettingsPage.page.subtitle')}
                    action={(
                        <AppButton
                            intent="primary"
                            icon={<SaveOutlined />}
                            onClick={() => form.submit()}
                            loading={loading}
                        >
                            {t('securitySettingsPage.page.saveButton')}
                        </AppButton>
                    )}
                />
            </div>

            <div className="mx-auto w-full max-w-4xl">
                <AppForm
                    form={form}
                    onFinish={handleSave}
                    initialValues={{
                        security_login_max_retries: 5,
                        security_lockout_duration: 15,
                        security_lockout_scope: 'account',

                        max_concurrent_sessions: 0,
                        login_session_timeout_minutes: 30,
                        admin_session_timeout_minutes: 30,
                        login_session_absolute_timeout_minutes: 480,
                        login_captcha_threshold: 3,
                    }}
                >
                    <div className="space-y-6">
                        <Card
                            className="admin-card"
                            title={<span className="inline-flex items-center gap-2"><SafetyCertificateOutlined />{t('securitySettingsPage.sections.loginProtection')}</span>}
                        >
                            <Row gutter={[16, 0]}>
                                <Col xs={24} md={8}>
                                    <AppForm.Item
                                name="security_login_max_retries"
                                label={t('securitySettingsPage.form.maxRetries')}
                            >
                                <InputNumber min={3} max={10} style={{ width: '100%' }} />
                                    </AppForm.Item>
                                </Col>

                                <Col xs={24} md={8}>
                                    <AppForm.Item
                                name="security_lockout_duration"
                                label={t('securitySettingsPage.form.lockoutDuration')}
                            >
                                <InputNumber min={5} max={1440} style={{ width: '100%' }} />
                                    </AppForm.Item>
                                </Col>

                                <Col xs={24} md={8}>
                                    <AppForm.Item
                                name="security_lockout_scope"
                                label={t('securitySettingsPage.form.lockoutScope')}
                                help={t('securitySettingsPage.form.lockoutScopeHelp')}
                            >
                                <Select
                                    options={[
                                        { value: 'account', label: t('securitySettingsPage.form.options.lockByAccount') },
                                        { value: 'ip', label: t('securitySettingsPage.form.options.lockByIp') },
                                    ]}
                                />
                                    </AppForm.Item>
                                </Col>

                                <Col xs={24} md={8}>
                                    <AppForm.Item
                                name="login_captcha_threshold"
                                label={t('securitySettingsPage.form.captchaThreshold')}
                            >
                                <InputNumber min={1} max={20} style={{ width: '100%' }} />
                                    </AppForm.Item>
                                </Col>
                            </Row>
                        </Card>

                        <Card
                            className="admin-card"
                            title={<span className="inline-flex items-center gap-2"><SafetyCertificateOutlined />{t('securitySettingsPage.sections.sessionCaptcha')}</span>}
                        >
                            <Row gutter={[16, 0]}>
                                <Col xs={24} md={12} xl={6}>
                                    <AppForm.Item
                                name="max_concurrent_sessions"
                                label={t('securitySettingsPage.form.maxConcurrentSessions')}
                            >
                                <InputNumber min={0} max={100} style={{ width: '100%' }} />
                                    </AppForm.Item>
                                </Col>

                                <Col xs={24} md={12} xl={6}>
                                    <AppForm.Item
                                name="login_session_timeout_minutes"
                                label={t('securitySettingsPage.form.sessionTimeoutMinutes')}
                            >
                                <InputNumber min={5} max={43200} style={{ width: '100%' }} />
                                    </AppForm.Item>
                                </Col>

                                <Col xs={24} md={12} xl={6}>
                                    <AppForm.Item
                                name="admin_session_timeout_minutes"
                                label={t('securitySettingsPage.form.adminSessionTimeoutMinutes')}
                            >
                                <InputNumber min={5} max={43200} style={{ width: '100%' }} />
                                    </AppForm.Item>
                                </Col>

                                <Col xs={24} md={12} xl={6}>
                                    <AppForm.Item
                                name="login_session_absolute_timeout_minutes"
                                label={t('securitySettingsPage.form.absoluteTimeoutMinutes')}
                                help={t('securitySettingsPage.form.absoluteTimeoutHelp')}
                            >
                                <InputNumber min={5} max={43200} style={{ width: '100%' }} />
                                    </AppForm.Item>
                                </Col>
                            </Row>
                        </Card>

                        <Card
                            className="admin-card"
                            title={<span className="inline-flex items-center gap-2"><GlobalOutlined />{t('securitySettingsPage.sections.networkAccess')}</span>}
                        >
                            <AppForm.Item
                            name="security_ip_allowlist"
                            label={t('securitySettingsPage.form.ipAllowlist')}
                            help={t('securitySettingsPage.form.ipAllowlistHelp')}
                        >
                            <Input.TextArea
                                rows={2}
                                placeholder={t('securitySettingsPage.form.placeholders.ipAllowlist')}
                            />
                            </AppForm.Item>
                        </Card>
                    </div>
                </AppForm>
            </div>
        </div>
    );
};

export default SecuritySettings;
