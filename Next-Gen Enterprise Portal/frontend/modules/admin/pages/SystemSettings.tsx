import React, { Suspense, lazy, useState, useEffect } from 'react';
import Alert from 'antd/es/alert';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Input from 'antd/es/input';
import Row from 'antd/es/grid/row';
import Space from 'antd/es/space';
import { SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { AppButton, AppForm, AppPageHeader } from '@/modules/admin/components/ui';
import Switch from 'antd/es/switch';

const UploadTriggerButton = lazy(() => import('@/modules/admin/components/upload/UploadTriggerButton'));

const SYSTEM_BRANDING_KEYS = [
    'app_name',
    'browser_title',
    'logo_url',
    'favicon_url',
    'favicon_url',
    'footer_text',
    'privacy_policy',
    'enable_holiday_banner',
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
                // Convert string 'true' to boolean true for Switch component
                const formattedConfig = { ...config } as Record<string, any>;
                if (formattedConfig.enable_holiday_banner !== undefined) {
                    formattedConfig.enable_holiday_banner = formattedConfig.enable_holiday_banner === 'true';
                }
                form.setFieldsValue(formattedConfig as BrandingFormValues);
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
                if (typeof value === 'boolean') {
                    acc[key] = value ? 'true' : 'false';
                } else if (typeof value === 'string') {
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
                                    <Suspense fallback={null}>
                                        <UploadTriggerButton
                                            loading={loading}
                                            onSelect={async (file) => {
                                                try {
                                                    setLoading(true);
                                                    const url = await ApiClient.uploadImage(file);
                                                    form.setFieldValue('logo_url', url);
                                                    message.success(t('systemSettingsPage.messages.uploadSuccess'));
                                                } catch {
                                                    message.error(t('systemSettingsPage.messages.uploadFailed'));
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                            buttonLabel={t('systemSettingsPage.actions.localUpload')}
                                        />
                                    </Suspense>
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
                                    <Suspense fallback={null}>
                                        <UploadTriggerButton
                                            loading={loading}
                                            onSelect={async (file) => {
                                                try {
                                                    setLoading(true);
                                                    const url = await ApiClient.uploadImage(file);
                                                    form.setFieldValue('favicon_url', url);
                                                    message.success(t('systemSettingsPage.messages.uploadSuccess'));
                                                } catch {
                                                    message.error(t('systemSettingsPage.messages.uploadFailed'));
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                            buttonLabel={t('systemSettingsPage.actions.localUpload')}
                                        />
                                    </Suspense>
                                </Col>
                            </Row>

                            <AppForm.Item
                            name="footer_text"
                            label={t('systemSettingsPage.form.footerText')}
                        >
                            <Input placeholder={t('systemSettingsPage.form.placeholders.footerText')} />
                            </AppForm.Item>
                        </Card>

                        <Card className="admin-card" title={t('systemSettingsPage.sections.features', '功能启停')}>
                            <AppForm.Item
                                name="enable_holiday_banner"
                                label={t('systemSettingsPage.form.enableHolidayBanner')}
                                help={t('systemSettingsPage.form.enableHolidayBannerHelp')}
                                valuePropName="checked"
                            >
                                <Switch />
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
