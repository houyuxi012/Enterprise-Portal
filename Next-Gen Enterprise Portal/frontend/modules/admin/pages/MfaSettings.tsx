import React, { useState, useEffect } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Row from 'antd/es/grid/row';
import Switch from 'antd/es/switch';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { SaveOutlined, LockOutlined, MobileOutlined, MailOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { AppButton, AppForm, AppPageHeader } from '@/modules/admin/components/ui';

type MfaSettingsFormValues = {
    security_mfa_enabled: boolean;
};

type MfaSettingsConfig = {
    security_mfa_enabled?: string;
};

type ApiErrorShape = {
    response?: {
        data?: {
            detail?: {
                message?: string;
            } | string;
        };
    };
};

const resolveApiErrorMessage = (error: unknown, fallback: string): string => {
    const detail = (error as ApiErrorShape)?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail.message === 'string') return detail.message;
    return fallback;
};

const MfaSettings: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [form] = AppForm.useForm<MfaSettingsFormValues>();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getMfaSettingsConfig() as MfaSettingsConfig;
                form.setFieldsValue({
                    security_mfa_enabled: config.security_mfa_enabled === 'true',
                });
            } catch (error: unknown) {
                message.error(resolveApiErrorMessage(error, t('mfaSettingsPage.messages.loadFailed')));
            }
        };
        fetchConfig();
    }, [form, t]);

    const handleSave = async (values: MfaSettingsFormValues) => {
        setLoading(true);
        try {
            const payload = {
                security_mfa_enabled: String(values.security_mfa_enabled),
            };
            await ApiClient.updateMfaSettingsConfig(payload);
            message.success(t('mfaSettingsPage.messages.saveSuccess'));
        } catch (error: unknown) {
            message.error(resolveApiErrorMessage(error, t('mfaSettingsPage.messages.saveFailed')));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('mfaSettingsPage.page.title')}
                subtitle={t('mfaSettingsPage.page.subtitle')}
                action={
                    <AppButton
                        intent="primary"
                        icon={<SaveOutlined />}
                        onClick={() => form.submit()}
                        loading={loading}
                    >
                        {t('mfaSettingsPage.page.saveButton')}
                    </AppButton>
                }
            />

            <div className="mx-auto w-full max-w-4xl">
                <AppForm
                    form={form}
                    onFinish={handleSave}
                    initialValues={{
                        security_mfa_enabled: false,
                    }}
                >
                    <div className="space-y-6">
                        <Card
                            className="admin-card"
                            title={<span className="inline-flex items-center gap-2"><LockOutlined />{t('mfaSettingsPage.sections.globalSwitch')}</span>}
                        >
                            <Row gutter={[16, 0]}>
                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="security_mfa_enabled"
                                label={t('mfaSettingsPage.form.forceMfa')}
                                help={t('mfaSettingsPage.form.forceMfaHelp')}
                                valuePropName="checked"
                            >
                                <Switch />
                                    </AppForm.Item>
                                </Col>
                            </Row>
                        </Card>

                        <Card
                            className="admin-card"
                            title={<span className="inline-flex items-center gap-2"><MobileOutlined />{t('mfaSettingsPage.sections.methods')}</span>}
                        >
                            <Row gutter={[16, 16]}>
                                <Col xs={24} md={8}>
                                    <Card size="small" className="admin-card admin-card-subtle" title={t('mfaSettingsPage.methods.totp.title')} extra={<Tag color="success">{t('mfaSettingsPage.methods.supported')}</Tag>}>
                                        <Typography.Text type="secondary">{t('mfaSettingsPage.methods.totp.description')}</Typography.Text>
                                    </Card>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Card size="small" className="admin-card admin-card-subtle" title={t('mfaSettingsPage.methods.email.title')} extra={<Tag color="success">{t('mfaSettingsPage.methods.supported')}</Tag>}>
                                        <Typography.Text type="secondary">{t('mfaSettingsPage.methods.email.description')}</Typography.Text>
                                    </Card>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Card size="small" className="admin-card admin-card-subtle" title={t('mfaSettingsPage.methods.webauthn.title')} extra={<Tag color="success">{t('mfaSettingsPage.methods.supported')}</Tag>}>
                                        <Typography.Text type="secondary">{t('mfaSettingsPage.methods.webauthn.description')}</Typography.Text>
                                    </Card>
                                </Col>
                            </Row>
                        </Card>
                    </div>
                </AppForm>
            </div>
        </div>
    );
};

export default MfaSettings;
