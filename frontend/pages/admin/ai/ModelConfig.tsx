import React, { useEffect, useState } from 'react';
import { Button, Card, Table, Tag, Modal, Form, Input, Select, Switch, message, Tooltip, Badge } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, ApiOutlined, KeyOutlined, RobotOutlined } from '@ant-design/icons';
import ApiClient from '../../../services/api';
import { AIProvider } from '../../../types';

const ModelConfig: React.FC = () => {
    const [providers, setProviders] = useState<AIProvider[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
    const [form] = Form.useForm();

    const fetchProviders = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getAIProviders();
            setProviders(data);
        } catch (error) {
            message.error('Failed to fetch providers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProviders();
    }, []);

    const handleAdd = () => {
        setEditingProvider(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record: AIProvider) => {
        setEditingProvider(record);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteAIProvider(id);
            message.success('Provider deleted');
            fetchProviders();
        } catch (error) {
            message.error('Failed to delete provider');
        }
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingProvider) {
                await ApiClient.updateAIProvider(editingProvider.id, values);
                message.success('Provider updated');
            } else {
                await ApiClient.createAIProvider(values);
                message.success('Provider created');
            }
            setIsModalVisible(false);
            fetchProviders();
        } catch (error) {
            message.error('Operation failed');
        }
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: AIProvider) => (
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{text}</span>
                    {record.is_active && <Tag color="green" icon={<CheckCircleOutlined />}>Active</Tag>}
                </div>
            )
        },
        {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
            render: (text: string) => {
                const colors: Record<string, string> = {
                    openai: 'green',
                    gemini: 'blue',
                    deepseek: 'purple',
                    dashscope: 'orange',
                    zhipu: 'cyan'
                };
                return <Tag color={colors[text] || 'default'}>{text.toUpperCase()}</Tag>;
            }
        },
        {
            title: 'Model',
            dataIndex: 'model',
            key: 'model',
            render: (text: string) => (
                <Tag icon={<RobotOutlined />} className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    {text}
                </Tag>
            )
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (isActive: boolean) => (
                <Badge status={isActive ? 'success' : 'default'} text={isActive ? 'Enabled' : 'Disabled'} />
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_: any, record: AIProvider) => (
                <div className="flex gap-2">
                    <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
                    <Button icon={<DeleteOutlined />} size="small" danger onClick={() => handleDelete(record.id)} />
                </div>
            )
        }
    ];

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">AI 模型配置</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">管理 AI 服务提供商及其连接参数</p>
                </div>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAdd}
                    className="bg-indigo-600 hover:bg-indigo-500 border-indigo-600 hover:border-indigo-500 h-10 px-6 rounded-xl shadow-lg shadow-indigo-500/20 font-bold"
                >
                    添加模型
                </Button>
            </div>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                <Table
                    columns={columns}
                    dataSource={providers}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    className="align-middle"
                />
            </Card>

            <Modal
                title={editingProvider ? "编辑模型" : "添加模型"}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
                okText="保存"
                cancelText="取消"
                className="rounded-2xl overflow-hidden"
                okButtonProps={{ className: "bg-indigo-600" }}
            >
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item name="name" label="名称" rules={[{ required: true }]}>
                        <Input prefix={<ApiOutlined className="text-slate-400" />} placeholder="例如: DeepSeek V3" className="h-10 rounded-lg" />
                    </Form.Item>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="type" label="厂商类型" rules={[{ required: true }]}>
                            <Select placeholder="选择厂商" className="h-10" popupClassName="rounded-xl">
                                <Select.Option value="openai">OpenAI</Select.Option>
                                <Select.Option value="deepseek">DeepSeek</Select.Option>
                                <Select.Option value="gemini">Google Gemini</Select.Option>
                                <Select.Option value="dashscope">阿里通义千问</Select.Option>
                                <Select.Option value="zhipu">智谱 AI</Select.Option>
                            </Select>
                        </Form.Item>

                        <Form.Item name="model" label="模型标识" rules={[{ required: true }]}>
                            <Input prefix={<RobotOutlined className="text-slate-400" />} placeholder="例如: deepseek-chat" className="h-10 rounded-lg" />
                        </Form.Item>
                    </div>

                    <Form.Item name="api_key" label="API Key" rules={[{ required: true }]}>
                        <Input.Password prefix={<KeyOutlined className="text-slate-400" />} placeholder="sk-..." className="h-10 rounded-lg" />
                    </Form.Item>

                    <Form.Item name="base_url" label="Base URL (可选)" tooltip="如果使用代理或兼容接口，请输入完整 URL">
                        <Input placeholder="https://api.deepseek.com/v1" className="h-10 rounded-lg" />
                    </Form.Item>

                    <Form.Item name="is_active" label="设为默认模型" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ModelConfig;
