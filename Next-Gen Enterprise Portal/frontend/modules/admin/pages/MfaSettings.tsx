import React, { useState, useEffect } from 'react';
import { Form, message, Switch, Divider, Alert } from 'antd';
import { SaveOutlined, LockOutlined, MobileOutlined, MailOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import AppButton from '@/shared/components/AppButton';

const MfaSettings: React.FC = () => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getMfaSettingsConfig();
                form.setFieldsValue({
                    security_mfa_enabled: config.security_mfa_enabled === 'true',
                });
            } catch (error: any) {
                message.error(error?.response?.data?.detail?.message || t('mfaSettingsPage.messages.loadFailed'));
            }
        };
        fetchConfig();
    }, [form, t]);

    const handleSave = async (values: any) => {
        setLoading(true);
        try {
            const payload = {
                security_mfa_enabled: String(values.security_mfa_enabled),
            };
            await ApiClient.updateMfaSettingsConfig(payload);
            message.success(t('mfaSettingsPage.messages.saveSuccess'));
        } catch (error: any) {
            message.error(error?.response?.data?.detail?.message || t('mfaSettingsPage.messages.saveFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2 max-w-4xl mx-auto w-full">
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{t('mfaSettingsPage.page.title')}</h2>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wide">{t('mfaSettingsPage.page.subtitle')}</p>
                </div>
                <AppButton
                    intent="primary"
                    icon={<SaveOutlined />}
                    onClick={() => form.submit()}
                    loading={loading}
                >
                    {t('mfaSettingsPage.page.saveButton')}
                </AppButton>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.25rem] p-6 shadow-sm border border-slate-100 dark:border-slate-700/50 max-w-4xl mx-auto animate-in slider-up duration-500">
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    className="space-y-5"
                    initialValues={{
                        security_mfa_enabled: false,
                    }}
                >
                    {/* MFA 全局开关 */}
                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">
                            <LockOutlined className="mr-2" /> {t('mfaSettingsPage.sections.globalSwitch')}
                        </h3>


                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Form.Item
                                name="security_mfa_enabled"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('mfaSettingsPage.form.forceMfa')}</span>}
                                help={<span className="text-[10px] text-slate-400">{t('mfaSettingsPage.form.forceMfaHelp')}</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>
                        </div>
                    </div>

                    <Divider className="my-2 border-slate-100 dark:border-slate-700" />

                    {/* MFA 方式（预留） */}
                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">
                            <MobileOutlined className="mr-2" /> {t('mfaSettingsPage.sections.methods')}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-4 border border-slate-200 dark:border-slate-600/50">
                                <div className="flex items-center space-x-3 mb-2">
                                    <MobileOutlined className="text-blue-500 text-lg" />
                                    <span className="font-bold text-slate-700 dark:text-slate-200 text-xs">{t('mfaSettingsPage.methods.totp.title')}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 leading-relaxed">{t('mfaSettingsPage.methods.totp.description')}</p>
                                <div className="mt-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                        {t('mfaSettingsPage.methods.supported')}
                                    </span>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-4 border border-slate-200 dark:border-slate-600/50">
                                <div className="flex items-center space-x-3 mb-2">
                                    <MailOutlined className="text-orange-500 text-lg" />
                                    <span className="font-bold text-slate-700 dark:text-slate-200 text-xs">{t('mfaSettingsPage.methods.email.title')}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 leading-relaxed">{t('mfaSettingsPage.methods.email.description')}</p>
                                <div className="mt-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                        {t('mfaSettingsPage.methods.supported')}
                                    </span>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-4 border border-slate-200 dark:border-slate-600/50">
                                <div className="flex items-center space-x-3 mb-2">
                                    <LockOutlined className="text-purple-500 text-lg" />
                                    <span className="font-bold text-slate-700 dark:text-slate-200 text-xs">{t('mfaSettingsPage.methods.webauthn.title')}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 leading-relaxed">{t('mfaSettingsPage.methods.webauthn.description')}</p>
                                <div className="mt-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                        {t('mfaSettingsPage.methods.supported')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </Form>
            </div>
        </div>
    );
};

export default MfaSettings;
