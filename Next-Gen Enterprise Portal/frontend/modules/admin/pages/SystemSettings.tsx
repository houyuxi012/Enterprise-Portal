import React, { useState, useEffect } from 'react';
import { Alert, App, Card, Col, Input, Row, Space, Upload } from 'antd';
import { SaveOutlined, UploadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { AppButton, AppForm, AppPageHeader } from '@/modules/admin/components/ui';

const SYSTEM_BRANDING_KEYS = [
    'app_name',
    'browser_title',
    'logo_url',
    'favicon_url',
    'footer_text',
    'privacy_policy',
] as const;

type BrandingKey = typeof SYSTEM_BRANDING_KEYS[number];
type BrandingFormValues = Partial<Record<BrandingKey, string>>;

type ApiErrorShape = {
    response?: {
        data?: {
            detail?: unknown;
        };
    };
};

const resolveApiErrorMessage = (error: unknown, fallback: string): string => {
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

interface SystemSettingsProps {
    licenseBlocked?: boolean;
    licenseBlockedMessage?: string;
}

const SystemSettings: React.FC<SystemSettingsProps> = ({
    licenseBlocked = false,
    licenseBlockedMessage = '',
}) => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [form] = AppForm.useForm<BrandingFormValues>();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getCustomizationConfig();
                form.setFieldsValue(config);
            } catch (error: unknown) {
                message.error(resolveApiErrorMessage(error, t('systemSettingsPage.messages.loadFailed')));
            }
        };
        fetchConfig();
    }, [form, t]);

    const handleSave = async (values: BrandingFormValues) => {
        if (licenseBlocked) {
            message.warning(licenseBlockedMessage || t('systemSettingsPage.messages.readonlyByLicense'));
            return;
        }
        setLoading(true);
        try {
            const payload = SYSTEM_BRANDING_KEYS.reduce((acc, key) => {
                const value = values[key];
                if (typeof value === 'string') {
                    acc[key] = value;
                }
                return acc;
            }, {} as Record<string, string>);
            await ApiClient.updateCustomizationConfig(payload);
            message.success(t('systemSettingsPage.messages.saveSuccess'));
            // Update document title immediately for feedback
            if (values.browser_title) {
                document.title = values.browser_title;
            }
        } catch (error: unknown) {
            message.error(resolveApiErrorMessage(error, t('systemSettingsPage.messages.saveFailed')));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-page admin-page-spaced">
            <div className="mx-auto w-full max-w-4xl">
                <AppPageHeader
                    title={t('systemSettingsPage.page.title')}
                    subtitle={t('systemSettingsPage.page.subtitle')}
                    action={(
                        <AppButton
                            intent="primary"
                            icon={<SaveOutlined />}
                            onClick={() => form.submit()}
                            loading={loading}
                            disabled={licenseBlocked}
                        >
                            {t('systemSettingsPage.page.saveButton')}
                        </AppButton>
                    )}
                />
            </div>

            <div className="mx-auto w-full max-w-4xl">
                {licenseBlocked && (
                    <Alert
                        type="warning"
                        showIcon
                        message={licenseBlockedMessage || t('systemSettingsPage.messages.readonlyByLicense')}
                    />
                )}
                <AppForm
                    form={form}
                    onFinish={handleSave}
                    disabled={licenseBlocked}
                >
                    <Space direction="vertical" size="large" style={{ width: '100%' }}>
                        <Card className="admin-card" title={t('systemSettingsPage.sections.branding')}>
                            <Row gutter={[16, 0]}>
                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="app_name"
                                label={t('systemSettingsPage.form.appName')}
                                help={t('systemSettingsPage.form.appNameHelp')}
                            >
                                <Input placeholder={t('systemSettingsPage.form.placeholders.appName')} />
                                    </AppForm.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                name="browser_title"
                                label={t('systemSettingsPage.form.browserTitle')}
                                help={t('systemSettingsPage.form.browserTitleHelp')}
                            >
                                <Input placeholder={t('systemSettingsPage.form.placeholders.browserTitle')} />
                                    </AppForm.Item>
                                </Col>
                            </Row>

                            <Row gutter={[16, 0]} align="bottom">
                                <Col xs={24} md={18}>
                                    <AppForm.Item
                                name="logo_url"
                                label={t('systemSettingsPage.form.logoUrl')}
                                help={t('systemSettingsPage.form.logoUrlHelp')}
                            >
                                <Input placeholder={t('systemSettingsPage.form.placeholders.logoUrl')} />
                                    </AppForm.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                    <Upload
                                    showUploadList={false}
                                    beforeUpload={async (file) => {
                                        try {
                                            setLoading(true);
                                            const url = await ApiClient.uploadImage(file);
                                            form.setFieldValue('logo_url', url);
                                            message.success(t('systemSettingsPage.messages.uploadSuccess'));
                                        } catch (error) {
                                            message.error(t('systemSettingsPage.messages.uploadFailed'));
                                        } finally {
                                            setLoading(false);
                                        }
                                        return false;
                                    }}
                                >
                                    <AppButton intent="secondary" icon={<UploadOutlined />}>{t('systemSettingsPage.actions.localUpload')}</AppButton>
                                    </Upload>
                                </Col>
                            </Row>

                            <Row gutter={[16, 0]} align="bottom">
                                <Col xs={24} md={18}>
                                    <AppForm.Item
                                name="favicon_url"
                                label={t('systemSettingsPage.form.faviconUrl')}
                                help={t('systemSettingsPage.form.faviconUrlHelp')}
                            >
                                <Input placeholder={t('systemSettingsPage.form.placeholders.faviconUrl')} />
                                    </AppForm.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                    <Upload
                                    showUploadList={false}
                                    beforeUpload={async (file) => {
                                        try {
                                            setLoading(true);
                                            const url = await ApiClient.uploadImage(file);
                                            form.setFieldValue('favicon_url', url);
                                            message.success(t('systemSettingsPage.messages.uploadSuccess'));
                                        } catch (error) {
                                            message.error(t('systemSettingsPage.messages.uploadFailed'));
                                        } finally {
                                            setLoading(false);
                                        }
                                        return false;
                                    }}
                                >
                                    <AppButton intent="secondary" icon={<UploadOutlined />}>{t('systemSettingsPage.actions.localUpload')}</AppButton>
                                    </Upload>
                                </Col>
                            </Row>

                            <AppForm.Item
                            name="footer_text"
                            label={t('systemSettingsPage.form.footerText')}
                        >
                            <Input placeholder={t('systemSettingsPage.form.placeholders.footerText')} />
                            </AppForm.Item>
                        </Card>

                        <Card className="admin-card" title={t('systemSettingsPage.sections.privacy')}>
                            <AppForm.Item
                            name="privacy_policy"
                            label={t('systemSettingsPage.form.privacyPolicy')}
                            help={t('systemSettingsPage.form.privacyPolicyHelp')}
                        >
                            <Input.TextArea
                                rows={10}
                                placeholder={t('systemSettingsPage.form.placeholders.privacyPolicy')}
                            />
                            </AppForm.Item>
                        </Card>
                    </Space>
                </AppForm>
            </div>
        </div>
    );
};

export default SystemSettings;
