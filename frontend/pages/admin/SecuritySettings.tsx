import React, { useState, useEffect } from 'react';
import { Form, Input, Button, message, Switch, InputNumber, Divider } from 'antd';
import { SaveOutlined, SafetyCertificateOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';

const SecuritySettings: React.FC = () => {
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
                    security_password_min_length: config.security_password_min_length ? parseInt(config.security_password_min_length) : 8,
                    security_login_max_retries: config.security_login_max_retries ? parseInt(config.security_login_max_retries) : 5,
                    security_lockout_duration: config.security_lockout_duration ? parseInt(config.security_lockout_duration) : 15,
                };

                form.setFieldsValue(formattedConfig);
            } catch (error) {
                message.error('Failed to load security settings');
            }
        };
        fetchConfig();
    }, [form]);

    const handleSave = async (values: any) => {
        setLoading(true);
        try {
            // Convert types back to string for storage
            const payload = {
                ...values,
                security_mfa_enabled: String(values.security_mfa_enabled),
                security_password_min_length: String(values.security_password_min_length),
                security_login_max_retries: String(values.security_login_max_retries),
                security_lockout_duration: String(values.security_lockout_duration),
            };

            await ApiClient.updateSystemConfig(payload);
            message.success('Security settings updated successfully.');
        } catch (error) {
            message.error('Failed to update settings');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2 max-w-4xl mx-auto w-full">
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">安全设置</h2>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wide">Security Policies</p>
                </div>
                <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={() => form.submit()}
                    loading={loading}
                    size="middle"
                    className="rounded-lg px-6 bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/30 border-0 font-bold"
                >
                    保存策略
                </Button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.25rem] p-6 shadow-sm border border-slate-100 dark:border-slate-700/50 max-w-4xl mx-auto animate-in slider-up duration-500">
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    className="space-y-5"
                    initialValues={{
                        security_password_min_length: 8,
                        security_login_max_retries: 5,
                        security_lockout_duration: 15,
                        security_mfa_enabled: false
                    }}
                >
                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">

                            <LockOutlined className="mr-2" /> 密码与认证
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Form.Item
                                name="security_password_min_length"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">密码最小长度</span>}
                            >
                                <InputNumber min={6} max={32} className="w-full rounded-lg" size="middle" />
                            </Form.Item>

                            <Form.Item
                                name="security_mfa_enabled"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">强制 MFA 认证</span>}
                                valuePropName="checked"
                            >
                                <Switch size="small" />
                            </Form.Item>
                        </div>
                    </div>

                    <Divider className="my-2 border-slate-100 dark:border-slate-700" />

                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">

                            <SafetyCertificateOutlined className="mr-2" /> 登录防护
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Form.Item
                                name="security_login_max_retries"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">最大重试次数</span>}
                            >
                                <InputNumber min={3} max={10} className="w-full rounded-lg" size="middle" />
                            </Form.Item>

                            <Form.Item
                                name="security_lockout_duration"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">锁定时间 (分钟)</span>}
                            >
                                <InputNumber min={5} max={1440} className="w-full rounded-lg" size="middle" />
                            </Form.Item>
                        </div>
                    </div>

                    <Divider className="my-2 border-slate-100 dark:border-slate-700" />

                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center">

                            <GlobalOutlined className="mr-2" /> 网络访问控制
                        </h3>

                        <Form.Item
                            name="security_ip_allowlist"
                            label={<span className="font-bold text-slate-600 dark:text-slate-300 text-xs">IP 白名单 (CIDR)</span>}
                            help={<span className="text-[10px] text-slate-400">留空代表允许所有 IP</span>}
                        >
                            <Input.TextArea
                                rows={2}
                                className="rounded-lg bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20 text-xs"
                                placeholder="192.168.1.0/24"
                            />
                        </Form.Item>
                    </div>

                </Form>
            </div>
        </div>
    );
};

export default SecuritySettings;
