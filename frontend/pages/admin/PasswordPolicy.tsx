import React, { useState, useEffect } from 'react';
import { Form, Switch, InputNumber, Divider, message } from 'antd';
import { SaveOutlined, LockOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import AppButton from '../../components/AppButton';
import ApiClient from '../../services/api';

const PasswordPolicy: React.FC = () => {
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
                };
                form.setFieldsValue(formattedConfig);
            } catch (error) {
                message.error('加载密码策略失败');
            }
        };
        fetchConfig();
    }, [form]);

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
            };
            await ApiClient.updateSystemConfig(payload);
            message.success('密码策略保存成功');
        } catch (error) {
            message.error('保存密码策略失败');
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
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">密码策略</h2>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wide">Password Policies</p>
                </div>
                <AppButton
                    intent="primary"
                    icon={<SaveOutlined />}
                    onClick={() => form.submit()}
                    loading={loading}
                >
                    保存策略
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
                    }}
                >
                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">
                            <LockOutlined className="mr-2" /> 密码复杂度要求
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Form.Item
                                name="security_password_min_length"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">最小密码长度</span>}
                                help={<span className="text-[10px] text-slate-400">建议设置为 8 位以上，以抵御暴力破解</span>}
                            >
                                <InputNumber min={6} max={64} className="w-full rounded-lg" size="middle" addonAfter="位" />
                            </Form.Item>

                            <Form.Item
                                name="security_password_require_uppercase"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">包含英文大写字母 (A-Z)</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>

                            <Form.Item
                                name="security_password_require_lowercase"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">包含英文小写字母 (a-z)</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>

                            <Form.Item
                                name="security_password_require_numbers"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">包含数字 (0-9)</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>

                            <Form.Item
                                name="security_password_require_symbols"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">包含特殊字符</span>}
                                help={<span className="text-[10px] text-slate-400">例如：!@#$%^&*()_+</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>
                        </div>
                    </div>

                    <Divider className="my-2 border-slate-100 dark:border-slate-700" />

                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">
                            <ClockCircleOutlined className="mr-2" /> 生命周期与重用限制
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Form.Item
                                name="security_password_max_age_days"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">定期修改密码提示 (有效期)</span>}
                                help={<span className="text-[10px] text-slate-400">超过此天数后强制修改，设为 0 永不过期</span>}
                            >
                                <InputNumber min={0} max={365} className="w-full rounded-lg" size="middle" addonAfter="天" />
                            </Form.Item>

                            <Form.Item
                                name="security_password_prevent_history_reuse"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">密码历史重复限制</span>}
                                help={<span className="text-[10px] text-slate-400">新密码不能与最近使用的历史密码相同</span>}
                            >
                                <InputNumber min={0} max={24} className="w-full rounded-lg" size="middle" addonAfter="次" />
                            </Form.Item>
                        </div>
                    </div>

                    <Divider className="my-2 border-slate-100 dark:border-slate-700" />

                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">
                            <UserOutlined className="mr-2" /> 用户信息关联
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Form.Item
                                name="security_password_check_user_info"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">用户信息检查</span>}
                                help={<span className="text-[10px] text-slate-400">开启后，密码中将不能包含该用户的用户名、手机号、邮箱前缀和姓名拼音</span>}
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
