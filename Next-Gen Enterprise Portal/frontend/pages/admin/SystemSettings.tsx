import React, { useState, useEffect } from 'react';
import { Alert, Form, Input, message, Upload } from 'antd';
import { SaveOutlined, UploadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '../../services/api';
import AppButton from '../../components/AppButton';

const SYSTEM_BRANDING_KEYS = [
    'app_name',
    'browser_title',
    'logo_url',
    'favicon_url',
    'footer_text',
    'privacy_policy',
] as const;

interface SystemSettingsProps {
    licenseBlocked?: boolean;
    licenseBlockedMessage?: string;
}

const SystemSettings: React.FC<SystemSettingsProps> = ({
    licenseBlocked = false,
    licenseBlockedMessage = '',
}) => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getCustomizationConfig();
                form.setFieldsValue(config);
            } catch (error: any) {
                message.error(error?.response?.data?.detail?.message || t('systemSettingsPage.messages.loadFailed'));
            }
        };
        fetchConfig();
    }, [form, t]);

    const handleSave = async (values: any) => {
        if (licenseBlocked) {
            message.warning(licenseBlockedMessage || t('systemSettingsPage.messages.readonlyByLicense'));
            return;
        }
        setLoading(true);
        try {
            const payload = SYSTEM_BRANDING_KEYS.reduce((acc, key) => {
                if (values[key] !== undefined) {
                    acc[key] = values[key];
                }
                return acc;
            }, {} as Record<string, any>);
            await ApiClient.updateCustomizationConfig(payload);
            message.success(t('systemSettingsPage.messages.saveSuccess'));
            // Update document title immediately for feedback
            if (values.browser_title) {
                document.title = values.browser_title;
            }
        } catch (error: any) {
            message.error(error?.response?.data?.detail?.message || t('systemSettingsPage.messages.saveFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2 max-w-4xl mx-auto w-full">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t('systemSettingsPage.page.title')}</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">{t('systemSettingsPage.page.subtitle')}</p>
                </div>
                <AppButton
                    intent="primary"
                    icon={<SaveOutlined />}
                    onClick={() => form.submit()}
                    loading={loading}
                    disabled={licenseBlocked}
                >
                    {t('systemSettingsPage.page.saveButton')}
                </AppButton>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50 max-w-4xl mx-auto animate-in slider-up duration-500">
                {licenseBlocked && (
                    <Alert
                        type="warning"
                        showIcon
                        className="mb-6 rounded-xl"
                        message={licenseBlockedMessage || t('systemSettingsPage.messages.readonlyByLicense')}
                    />
                )}
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    className="space-y-8"
                    disabled={licenseBlocked}
                >
                    <div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center">

                            {t('systemSettingsPage.sections.branding')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Form.Item
                                name="app_name"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300">{t('systemSettingsPage.form.appName')}</span>}
                                help={t('systemSettingsPage.form.appNameHelp')}
                            >
                                <Input className="rounded-xl py-2.5 bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20" placeholder={t('systemSettingsPage.form.placeholders.appName')} />
                            </Form.Item>

                            <Form.Item
                                name="browser_title"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300">{t('systemSettingsPage.form.browserTitle')}</span>}
                                help={t('systemSettingsPage.form.browserTitleHelp')}
                            >
                                <Input className="rounded-xl py-2.5 bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20" placeholder={t('systemSettingsPage.form.placeholders.browserTitle')} />
                            </Form.Item>
                        </div>

                        <div className="flex flex-col md:flex-row gap-6 mt-4">
                            <Form.Item
                                name="logo_url"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300">{t('systemSettingsPage.form.logoUrl')}</span>}
                                help={t('systemSettingsPage.form.logoUrlHelp')}
                                className="flex-1"
                            >
                                <Input className="rounded-xl py-2.5 bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20" placeholder={t('systemSettingsPage.form.placeholders.logoUrl')} />
                            </Form.Item>

                            <div className="md:mt-8">
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
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-6 mt-4">
                            <Form.Item
                                name="favicon_url"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300">{t('systemSettingsPage.form.faviconUrl')}</span>}
                                help={t('systemSettingsPage.form.faviconUrlHelp')}
                                className="flex-1"
                            >
                                <Input className="rounded-xl py-2.5 bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20" placeholder={t('systemSettingsPage.form.placeholders.faviconUrl')} />
                            </Form.Item>

                            <div className="md:mt-8">
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
                            </div>
                        </div>

                        <Form.Item
                            name="footer_text"
                            label={<span className="font-bold text-slate-600 dark:text-slate-300">{t('systemSettingsPage.form.footerText')}</span>}
                            className="mt-4"
                        >
                            <Input className="rounded-xl py-2.5 bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20" placeholder={t('systemSettingsPage.form.placeholders.footerText')} />
                        </Form.Item>
                    </div>

                    <div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center">
                            {t('systemSettingsPage.sections.privacy')}
                        </h3>
                        <Form.Item
                            name="privacy_policy"
                            label={<span className="font-bold text-slate-600 dark:text-slate-300">{t('systemSettingsPage.form.privacyPolicy')}</span>}
                            help={t('systemSettingsPage.form.privacyPolicyHelp')}
                        >
                            <Input.TextArea
                                rows={10}
                                className="rounded-xl bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20 font-mono text-sm leading-relaxed"
                                placeholder={t('systemSettingsPage.form.placeholders.privacyPolicy')}
                            />
                        </Form.Item>
                    </div>
                </Form>
            </div>
        </div>
    );
};

export default SystemSettings;
