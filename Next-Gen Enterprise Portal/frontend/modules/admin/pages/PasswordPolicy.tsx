import React, { useState, useEffect } from 'react';
import { Form, Switch, InputNumber, Divider, message } from 'antd';
import { SaveOutlined, LockOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import AppButton from '@/shared/components/AppButton';
import ApiClient from '@/services/api';

const PasswordPolicy: React.FC = () => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
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

    const handleSave = async (values: any) => {
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
        <div className="space-y-4 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2 max-w-4xl mx-auto w-full">
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{t('passwordPolicyPage.page.title')}</h2>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wide">{t('passwordPolicyPage.page.subtitle')}</p>
                </div>
                <AppButton
                    intent="primary"
                    icon={<SaveOutlined />}
                    onClick={() => form.submit()}
                    loading={loading}
                >
                    {t('passwordPolicyPage.page.saveButton')}
                </AppButton>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.25rem] p-6 shadow-sm border border-slate-100 dark:border-slate-700/50 max-w-4xl mx-auto animate-in slider-up duration-500">
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    className="space-y-5"
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
                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">
                            <LockOutlined className="mr-2" /> {t('passwordPolicyPage.sections.complexity')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Form.Item
                                name="security_password_min_length"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('passwordPolicyPage.form.minLength')}</span>}
                                help={<span className="text-[10px] text-slate-400">{t('passwordPolicyPage.form.minLengthHelp')}</span>}
                            >
                                <InputNumber min={6} max={64} className="w-full rounded-lg" size="middle" addonAfter={t('passwordPolicyPage.units.characters')} />
                            </Form.Item>

                            <Form.Item
                                name="security_password_require_uppercase"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('passwordPolicyPage.form.requireUppercase')}</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>

                            <Form.Item
                                name="security_password_require_lowercase"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('passwordPolicyPage.form.requireLowercase')}</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>

                            <Form.Item
                                name="security_password_require_numbers"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('passwordPolicyPage.form.requireNumbers')}</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>

                            <Form.Item
                                name="security_password_require_symbols"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('passwordPolicyPage.form.requireSymbols')}</span>}
                                help={<span className="text-[10px] text-slate-400">{t('passwordPolicyPage.form.requireSymbolsHelp')}</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>
                        </div>
                    </div>

                    <Divider className="my-2 border-slate-100 dark:border-slate-700" />

                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">
                            <ClockCircleOutlined className="mr-2" /> {t('passwordPolicyPage.sections.lifecycle')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Form.Item
                                name="security_password_max_age_days"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('passwordPolicyPage.form.maxAgeDays')}</span>}
                                help={<span className="text-[10px] text-slate-400">{t('passwordPolicyPage.form.maxAgeDaysHelp')}</span>}
                            >
                                <InputNumber min={0} max={365} className="w-full rounded-lg" size="middle" addonAfter={t('passwordPolicyPage.units.days')} />
                            </Form.Item>

                            <Form.Item
                                name="security_password_prevent_history_reuse"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('passwordPolicyPage.form.preventHistoryReuse')}</span>}
                                help={<span className="text-[10px] text-slate-400">{t('passwordPolicyPage.form.preventHistoryReuseHelp')}</span>}
                            >
                                <InputNumber min={0} max={24} className="w-full rounded-lg" size="middle" addonAfter={t('passwordPolicyPage.units.times')} />
                            </Form.Item>

                            <Form.Item
                                name="security_force_change_password_after_reset"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('passwordPolicyPage.form.forceChangeAfterReset')}</span>}
                                help={<span className="text-[10px] text-slate-400">{t('passwordPolicyPage.form.forceChangeAfterResetHelp')}</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>
                        </div>
                    </div>

                    <Divider className="my-2 border-slate-100 dark:border-slate-700" />

                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">
                            <UserOutlined className="mr-2" /> {t('passwordPolicyPage.sections.userInfo')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Form.Item
                                name="security_password_check_user_info"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">{t('passwordPolicyPage.form.checkUserInfo')}</span>}
                                help={<span className="text-[10px] text-slate-400">{t('passwordPolicyPage.form.checkUserInfoHelp')}</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>
                        </div>
                    </div>
                </Form>
            </div>
        </div>
    );
};

export default PasswordPolicy;
