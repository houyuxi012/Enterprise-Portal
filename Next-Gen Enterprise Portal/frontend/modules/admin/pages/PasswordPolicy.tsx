import React, { useState, useEffect } from 'react';
import { App, Card, Col, InputNumber, Row, Switch } from 'antd';
import { SaveOutlined, LockOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AppButton, AppForm, AppPageHeader } from '@/modules/admin/components/ui';
import ApiClient from '@/services/api';

type PasswordPolicyFormValues = {
    security_password_min_length: number;
    security_password_require_uppercase: boolean;
    security_password_require_lowercase: boolean;
    security_password_require_numbers: boolean;
    security_password_require_symbols: boolean;
    security_password_max_age_days: number;
    security_password_prevent_history_reuse: number;
    security_password_check_user_info: boolean;
    security_force_change_password_after_reset: boolean;
};

const PasswordPolicy: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [form] = AppForm.useForm<PasswordPolicyFormValues>();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getSystemConfig();
                const formattedConfig = {
                    security_password_min_length: config.security_password_min_length ? parseInt(config.security_password_min_length) : 8,
                    security_password_require_uppercase: config.security_password_require_uppercase === 'true',
                    security_password_require_lowercase: config.security_password_require_lowercase === 'true',
                    security_password_require_numbers: config.security_password_require_numbers === 'true',
                    security_password_require_symbols: config.security_password_require_symbols === 'true',
                    security_password_max_age_days: config.security_password_max_age_days ? parseInt(config.security_password_max_age_days) : 90,
                    security_password_prevent_history_reuse: config.security_password_prevent_history_reuse ? parseInt(config.security_password_prevent_history_reuse) : 5,
                    security_password_check_user_info: config.security_password_check_user_info === 'true',
                    security_force_change_password_after_reset: config.security_force_change_password_after_reset === 'true',
                };
                form.setFieldsValue(formattedConfig);
            } catch (error) {
                message.error(t('passwordPolicyPage.messages.loadFailed'));
            }
        };
        fetchConfig();
    }, [form, t]);

    const handleSave = async (values: PasswordPolicyFormValues) => {
        setLoading(true);
        try {
            const payload = {
                security_password_min_length: String(values.security_password_min_length),
                security_password_require_uppercase: String(values.security_password_require_uppercase),
                security_password_require_lowercase: String(values.security_password_require_lowercase),
                security_password_require_numbers: String(values.security_password_require_numbers),
                security_password_require_symbols: String(values.security_password_require_symbols),
                security_password_max_age_days: String(values.security_password_max_age_days),
                security_password_prevent_history_reuse: String(values.security_password_prevent_history_reuse),
                security_password_check_user_info: String(values.security_password_check_user_info),
                security_force_change_password_after_reset: String(values.security_force_change_password_after_reset),
            };
            await ApiClient.updateSystemConfig(payload);
            message.success(t('passwordPolicyPage.messages.saveSuccess'));
        } catch (error) {
            message.error(t('passwordPolicyPage.messages.saveFailed'));
            console.error('Failed to save password policy', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-page admin-page-spaced">
            <div className="mx-auto w-full max-w-4xl">
                <AppPageHeader
                    title={t('passwordPolicyPage.page.title')}
                    subtitle={t('passwordPolicyPage.page.subtitle')}
                    action={(
                        <AppButton
                            intent="primary"
                            icon={<SaveOutlined />}
                            onClick={() => form.submit()}
                            loading={loading}
                        >
                            {t('passwordPolicyPage.page.saveButton')}
                        </AppButton>
                    )}
                />
            </div>

            <div className="mx-auto w-full max-w-4xl">
                <AppForm
                    form={form}
                    onFinish={handleSave}
                    initialValues={{
                        security_password_min_length: 8,
                        security_password_require_uppercase: true,
                        security_password_require_lowercase: true,
                        security_password_require_numbers: true,
                        security_password_require_symbols: true,
                        security_password_max_age_days: 90,
                        security_password_prevent_history_reuse: 5,
                        security_password_check_user_info: true,
                        security_force_change_password_after_reset: false,
                    }}
                >
                    <div className="space-y-6">
                        <Card
                            className="admin-card"
                            title={<span className="inline-flex items-center gap-2"><LockOutlined />{t('passwordPolicyPage.sections.complexity')}</span>}
                        >
                            <Row gutter={[16, 0]}>
                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="security_password_min_length"
                                label={t('passwordPolicyPage.form.minLength')}
                                help={t('passwordPolicyPage.form.minLengthHelp')}
                            >
                                <InputNumber min={6} max={64} style={{ width: '100%' }} addonAfter={t('passwordPolicyPage.units.characters')} />
                                    </AppForm.Item>
                                </Col>

                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="security_password_require_uppercase"
                                label={t('passwordPolicyPage.form.requireUppercase')}
                                valuePropName="checked"
                            >
                                <Switch />
                                    </AppForm.Item>
                                </Col>

                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="security_password_require_lowercase"
                                label={t('passwordPolicyPage.form.requireLowercase')}
                                valuePropName="checked"
                            >
                                <Switch />
                                    </AppForm.Item>
                                </Col>

                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="security_password_require_numbers"
                                label={t('passwordPolicyPage.form.requireNumbers')}
                                valuePropName="checked"
                            >
                                <Switch />
                                    </AppForm.Item>
                                </Col>

                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="security_password_require_symbols"
                                label={t('passwordPolicyPage.form.requireSymbols')}
                                help={t('passwordPolicyPage.form.requireSymbolsHelp')}
                                valuePropName="checked"
                            >
                                <Switch />
                                    </AppForm.Item>
                                </Col>
                            </Row>
                        </Card>

                        <Card
                            className="admin-card"
                            title={<span className="inline-flex items-center gap-2"><ClockCircleOutlined />{t('passwordPolicyPage.sections.lifecycle')}</span>}
                        >
                            <Row gutter={[16, 0]}>
                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="security_password_max_age_days"
                                label={t('passwordPolicyPage.form.maxAgeDays')}
                                help={t('passwordPolicyPage.form.maxAgeDaysHelp')}
                            >
                                <InputNumber min={0} max={365} style={{ width: '100%' }} addonAfter={t('passwordPolicyPage.units.days')} />
                                    </AppForm.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="security_password_prevent_history_reuse"
                                label={t('passwordPolicyPage.form.preventHistoryReuse')}
                                help={t('passwordPolicyPage.form.preventHistoryReuseHelp')}
                            >
                                <InputNumber min={0} max={24} style={{ width: '100%' }} addonAfter={t('passwordPolicyPage.units.times')} />
                                    </AppForm.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="security_force_change_password_after_reset"
                                label={t('passwordPolicyPage.form.forceChangeAfterReset')}
                                help={t('passwordPolicyPage.form.forceChangeAfterResetHelp')}
                                valuePropName="checked"
                            >
                                <Switch />
                                    </AppForm.Item>
                                </Col>
                            </Row>
                        </Card>

                        <Card
                            className="admin-card"
                            title={<span className="inline-flex items-center gap-2"><UserOutlined />{t('passwordPolicyPage.sections.userInfo')}</span>}
                        >
                            <Row gutter={[16, 0]}>
                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="security_password_check_user_info"
                                label={t('passwordPolicyPage.form.checkUserInfo')}
                                help={t('passwordPolicyPage.form.checkUserInfoHelp')}
                                valuePropName="checked"
                            >
                                <Switch />
                                    </AppForm.Item>
                                </Col>
                            </Row>
                        </Card>
                    </div>
                </AppForm>
            </div>
        </div>
    );
};

export default PasswordPolicy;
