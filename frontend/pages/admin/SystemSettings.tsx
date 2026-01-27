import React, { useState, useEffect } from 'react';
import { Form, Input, Button, message, Card } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';

const SystemSettings: React.FC = () => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getSystemConfig();
                form.setFieldsValue(config);
            } catch (error) {
                message.error('Failed to load system settings');
            }
        };
        fetchConfig();
    }, [form]);

    const handleSave = async (values: any) => {
        setLoading(true);
        try {
            await ApiClient.updateSystemConfig(values);
            message.success('Settings updated successfully. Please refresh the page to see changes.');
            // Update document title immediately for feedback
            if (values.browser_title) {
                document.title = values.browser_title;
            }
        } catch (error) {
            message.error('Failed to update settings');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 dark:bg-slate-800 dark:border-slate-700 max-w-2xl mx-auto">
            <div className="mb-6">
                <h2 className="text-2xl font-bold dark:text-white">系统设置</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">配置全局应用程序参数</p>
            </div>

            <Form
                form={form}
                layout="vertical"
                onFinish={handleSave}
            >
                <Card title="品牌与显示" className="mb-6 shadow-sm">
                    <Form.Item
                        name="app_name"
                        label="应用名称 (Navbar Logo Text)"
                        help="显示在导航栏左侧的名称，默认为 'ShiKu Home'"
                    >
                        <Input placeholder="ShiKu Home" />
                    </Form.Item>

                    <Form.Item
                        name="browser_title"
                        label="浏览器标题 (Browser Tab Title)"
                        help="浏览器标签页上显示的完整标题"
                    >
                        <Input placeholder="ShiKu Home | Next-Gen Enterprise Portal" />
                    </Form.Item>

                    <Form.Item
                        name="logo_url"
                        label="Logo 图片地址 (可选)"
                        help="如果不填则使用默认的纯CSS Logo。输入图片URL可替换默认Logo。"
                    >
                        <Input placeholder="https://example.com/logo.png" />
                    </Form.Item>
                </Card>

                <Form.Item>
                    <Button
                        type="primary"
                        htmlType="submit"
                        icon={<SaveOutlined />}
                        loading={loading}
                        size="large"
                        className="w-full h-12 rounded-xl"
                    >
                        保存更改
                    </Button>
                </Form.Item>
            </Form>
        </div>
    );
};

export default SystemSettings;
