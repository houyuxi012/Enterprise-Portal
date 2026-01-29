import React, { useState, useEffect } from 'react';
import { Form, Input, Button, message, Card, Upload } from 'antd';
import { SaveOutlined, UploadOutlined } from '@ant-design/icons';
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
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2 max-w-4xl mx-auto w-full">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">系统设置</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">配置全局站点参数与品牌显示</p>
                </div>
                <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={() => form.submit()}
                    loading={loading}
                    size="large"
                    className="rounded-xl px-8 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 border-0 h-10 font-bold transition-all hover:scale-105 active:scale-95"
                >
                    保存更改
                </Button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50 max-w-4xl mx-auto animate-in slider-up duration-500">
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    className="space-y-8"
                >
                    <div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center">
                            <span className="w-1 h-6 bg-indigo-500 rounded-full mr-3"></span>
                            品牌与显示
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Form.Item
                                name="app_name"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300">站点名称</span>}
                                help="显示在导航栏左侧的名称"
                            >
                                <Input className="rounded-xl py-2.5 bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20" placeholder="ShiKu Home" />
                            </Form.Item>

                            <Form.Item
                                name="browser_title"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300">浏览器标题</span>}
                                help="浏览器标签页上显示的完整标题"
                            >
                                <Input className="rounded-xl py-2.5 bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20" placeholder="ShiKu Home | Next-Gen Enterprise Portal" />
                            </Form.Item>
                        </div>

                        <div className="flex flex-col md:flex-row gap-6 mt-4">
                            <Form.Item
                                name="logo_url"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300">Logo 图片地址</span>}
                                help="输入图片URL或直接上传。留空则使用默认Logo。"
                                className="flex-1"
                            >
                                <Input className="rounded-xl py-2.5 bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20" placeholder="https://example.com/logo.png" />
                            </Form.Item>

                            <div className="md:mt-8">
                                <Upload
                                    showUploadList={false}
                                    beforeUpload={async (file) => {
                                        try {
                                            setLoading(true);
                                            const url = await ApiClient.uploadImage(file);
                                            form.setFieldValue('logo_url', url);
                                            message.success('上传成功');
                                        } catch (error) {
                                            message.error('上传失败');
                                        } finally {
                                            setLoading(false);
                                        }
                                        return false;
                                    }}
                                >
                                    <Button size="large" icon={<UploadOutlined />} className="rounded-xl h-[42px] font-bold">本地上传</Button>
                                </Upload>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-6 mt-4">
                            <Form.Item
                                name="favicon_url"
                                label={<span className="font-bold text-slate-600 dark:text-slate-300">Favicon 图标地址</span>}
                                help="输入.ico/.png图片URL或直接上传(建议32x32)。"
                                className="flex-1"
                            >
                                <Input className="rounded-xl py-2.5 bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20" placeholder="https://example.com/favicon.ico" />
                            </Form.Item>

                            <div className="md:mt-8">
                                <Upload
                                    showUploadList={false}
                                    beforeUpload={async (file) => {
                                        try {
                                            setLoading(true);
                                            const url = await ApiClient.uploadImage(file);
                                            form.setFieldValue('favicon_url', url);
                                            message.success('上传成功');
                                        } catch (error) {
                                            message.error('上传失败');
                                        } finally {
                                            setLoading(false);
                                        }
                                        return false;
                                    }}
                                >
                                    <Button size="large" icon={<UploadOutlined />} className="rounded-xl h-[42px] font-bold">本地上传</Button>
                                </Upload>
                            </div>
                        </div>

                        <Form.Item
                            name="footer_text"
                            label={<span className="font-bold text-slate-600 dark:text-slate-300">底部版权文字</span>}
                            className="mt-4"
                        >
                            <Input className="rounded-xl py-2.5 bg-slate-50 border-slate-200 focus:ring-2 ring-indigo-500/20" placeholder="© 2025 Company. All Rights Reserved." />
                        </Form.Item>
                    </div>
                </Form>
            </div>
        </div>
    );
};

export default SystemSettings;
