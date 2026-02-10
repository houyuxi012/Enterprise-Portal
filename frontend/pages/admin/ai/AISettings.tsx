import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Switch, message, Upload, Avatar, Select } from 'antd';
import { SaveOutlined, UploadOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import ApiClient from '../../../services/api';
import AppButton from '../../../components/AppButton';

const AISettings: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const [imageUrl, setImageUrl] = useState<string>('');
    const [models, setModels] = useState<any[]>([]);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const [config, modelList] = await Promise.all([
                ApiClient.getSystemConfig(),
                ApiClient.getAIModels()
            ]);

            setModels(modelList);

            form.setFieldsValue({
                ai_name: config.ai_name || 'AI Assistant',
                ai_icon: config.ai_icon || '',
                ai_enabled: config.ai_enabled !== 'false', // Default true implies enabled unless explicitly false
                search_ai_enabled: config.search_ai_enabled !== 'false',
                kb_enabled: config.kb_enabled !== 'false',
                default_ai_model: config.default_ai_model ? Number(config.default_ai_model) : (modelList.length > 0 ? modelList[0].id : undefined)
            });
            setImageUrl(config.ai_icon || '');
        } catch (error) {
            message.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const handleSave = async (values: any) => {
        setLoading(true);
        try {
            // Convert boolean to string for backend storage
            // Convert boolean to string for backend storage
            const configToSave = {
                ai_name: values.ai_name,
                ai_icon: values.ai_icon,
                ai_enabled: String(values.ai_enabled),
                search_ai_enabled: String(values.search_ai_enabled),
                kb_enabled: String(values.kb_enabled),
                default_ai_model: values.default_ai_model ? String(values.default_ai_model) : '',
            };
            await ApiClient.updateSystemConfig(configToSave);
            message.success('Settings saved successfully');
            // Trigger a re-fetch or context update if needed
            window.location.reload(); // Simple reload to apply global changes for now
        } catch (error) {
            message.error('Failed to save settings');
        } finally {
            setLoading(false);
        }
    };

    const normFile = (e: any) => {
        if (Array.isArray(e)) {
            return e;
        }
        return e?.fileList;
    };

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">基础设置</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">配置 AI 助手的基本信息与功能开关</p>
                </div>
                <AppButton
                    intent="primary"
                    icon={<SaveOutlined />}
                    onClick={() => form.submit()}
                    loading={loading}
                >保存设置</AppButton>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                        <Form
                            form={form}
                            layout="vertical"
                            onFinish={handleSave}
                            className="p-4"
                        >
                            <Form.Item
                                name="ai_enabled"
                                label="启用 AI 助手"
                                valuePropName="checked"
                                help="关闭后，全站将隐藏 AI 助手入口"
                            >
                                <Switch />
                            </Form.Item>

                            <Form.Item
                                name="search_ai_enabled"
                                label="启用搜索栏 AI 增强"
                                valuePropName="checked"
                                help="在搜索栏提供 AI 智能预览结果以及搜索建议"
                            >
                                <Switch />
                            </Form.Item>

                            <Form.Item
                                name="kb_enabled"
                                label="启用本地知识库"
                                valuePropName="checked"
                                help="开启后，AI 助手将优先从本地知识库检索信息以回答问题"
                            >
                                <Switch />
                            </Form.Item>

                            <Form.Item
                                name="default_ai_model"
                                label="默认 AI 模型"
                                help="AI 助手启动时默认选中的模型"
                            >
                                <Select placeholder="选择默认模型">
                                    {models.map(m => (
                                        <Select.Option key={m.id} value={m.id}>{m.name} ({m.model})</Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>

                            <Form.Item
                                name="ai_name"
                                label="助手名称"
                                rules={[{ required: true, message: '请输入助手名称' }]}
                            >
                                <Input prefix={<RobotOutlined className="text-slate-400" />} placeholder="例如: 企业智能助手" className="h-10 rounded-lg" />
                            </Form.Item>

                            <Form.Item
                                name="ai_icon"
                                label="助手图标"
                                help="支持 PNG 格式图片上传，也可直接输入 URL"
                            >
                                <div className="flex gap-3">
                                    <Input
                                        value={imageUrl}
                                        onChange={(e) => {
                                            setImageUrl(e.target.value);
                                            form.setFieldValue('ai_icon', e.target.value);
                                        }}
                                        placeholder="https://example.com/icon.png"
                                        className="h-10 rounded-lg flex-1"
                                        prefix={<UploadOutlined className="text-slate-400" />}
                                    />
                                    <Upload
                                        accept="image/png"
                                        showUploadList={false}
                                        beforeUpload={(file) => {
                                            if (file.type !== 'image/png') {
                                                message.error('只支持 PNG 格式的图片!');
                                                return Upload.LIST_IGNORE;
                                            }
                                            return true;
                                        }}
                                        customRequest={async ({ file, onSuccess, onError }) => {
                                            try {
                                                const url = await ApiClient.uploadImage(file as File);
                                                setImageUrl(url);
                                                form.setFieldValue('ai_icon', url);
                                                message.success('图标上传成功');
                                                onSuccess?.(url);
                                            } catch (err) {
                                                message.error('上传失败');
                                                onError?.(err as Error);
                                            }
                                        }}
                                    >
                                        <AppButton intent="secondary" icon={<UploadOutlined />}>上传 PNG</AppButton>
                                    </Upload>
                                </div>
                            </Form.Item>
                        </Form>
                    </Card>
                </div>

                <div className="lg:col-span-1">
                    <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] h-full">
                        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-6">预览效果</h3>

                            <div className="relative group cursor-pointer">
                                <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 overflow-hidden transition-transform duration-300 group-hover:scale-110">
                                    {imageUrl ? (
                                        <img src={imageUrl} alt="AI Icon" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = ''; setImageUrl(''); }} />
                                    ) : (
                                        <SparklesIcon />
                                    )}
                                </div>
                            </div>

                            <h4 className="mt-4 font-bold text-slate-800 dark:text-white">
                                {form.getFieldValue('ai_name') || 'AI Assistant'}
                            </h4>
                            <p className="text-xs text-slate-400 mt-1">点击右下角浮窗即可唤起</p>

                            <div className="mt-8 p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl text-left w-full">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">配置说明</span>
                                <ul className="text-sm text-slate-500 dark:text-slate-400 space-y-2 list-disc list-inside">
                                    <li>支持 JPG, PNG, SVG 格式图标</li>
                                    <li>建议尺寸 128x128 像素</li>
                                    <li>关闭开关后即时生效</li>
                                </ul>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

// Simple icon component for preview
const SparklesIcon = () => (
    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
);

export default AISettings;
