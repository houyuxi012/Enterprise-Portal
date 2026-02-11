import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Modal, Form, Input, Select, Switch, message, Badge } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, ApiOutlined, KeyOutlined, RobotOutlined } from '@ant-design/icons';
import ApiClient from '../../../services/api';
import { AIProvider } from '../../../types';
import AppButton from '../../../components/AppButton';


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
            message.error('获取模型列表失败');
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
        form.setFieldsValue({
            model_kind: 'text',
            is_active: false,
        });
        setIsModalVisible(true);
    };

    const handleEdit = (record: AIProvider) => {
        setEditingProvider(record);
        form.setFieldsValue({
            ...record,
            model_kind: record.model_kind || 'text',
        });
        setIsModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteAIProvider(id);
            message.success('模型已删除');
            fetchProviders();
        } catch (error) {
            message.error('删除模型失败');
        }
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();

            // Encryption handled by backend at rest (TLS in transit)


            if (editingProvider) {
                await ApiClient.updateAIProvider(editingProvider.id, values);
                message.success('模型已更新');
            } else {
                await ApiClient.createAIProvider(values);
                message.success('模型已创建');
            }
            setIsModalVisible(false);
            fetchProviders();
        } catch (error) {
            console.error(error);
            message.error('操作失败');
        }
    };

    const columns = [
        {
            title: '模型名称',
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
            title: '厂商类型',
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
            title: '模型标识',
            dataIndex: 'model',
            key: 'model',
            render: (text: string) => (
                <Tag icon={<RobotOutlined />} className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    {text}
                </Tag>
            )
        },
        {
            title: '模型类型',
            dataIndex: 'model_kind',
            key: 'model_kind',
            render: (kind: AIProvider['model_kind']) => (
                kind === 'multimodal'
                    ? <Tag color="magenta">多模态</Tag>
                    : <Tag color="geekblue">文本</Tag>
            )
        },
        {
            title: '状态',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (isActive: boolean) => (
                <Badge status={isActive ? 'success' : 'default'} text={isActive ? '已启用' : '已禁用'} />
            )
        },
        {
            title: '操作',
            key: 'actions',
            render: (_: any, record: AIProvider) => (
                <div className="flex gap-1">
                    <AppButton intent="tertiary" iconOnly size="sm" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <AppButton intent="danger" iconOnly size="sm" icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
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
                <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加模型</AppButton>
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
                onCancel={() => setIsModalVisible(false)}
                className="rounded-2xl overflow-hidden"
                footer={[
                    <AppButton key="test" intent="secondary" icon={<ApiOutlined />} onClick={async () => {
                        try {
                            const values = await form.validateFields();
                            const hide = message.loading('正在测试连接...', 0);
                            try {
                                const res = await ApiClient.testAIProvider(values);
                                hide();
                                if (res.status === 'success') {
                                    message.success('连接成功');
                                } else {
                                    message.error(res.message || '连接失败');
                                }
                            } catch (err: any) {
                                hide();
                                message.error(err.response?.data?.detail || '连接失败');
                            }
                        } catch (e) {
                            // Validation failed
                        }
                    }}>测试连接</AppButton>,
                    <AppButton key="cancel" intent="secondary" onClick={() => setIsModalVisible(false)}>取消</AppButton>,
                    <AppButton key="submit" intent="primary" onClick={handleOk}>保存</AppButton>,
                ]}
            >
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item name="name" label="名称" rules={[{ required: true }]}>
                        <Input prefix={<ApiOutlined className="text-slate-400" />} placeholder="例如: DeepSeek V3" className="h-10 rounded-lg" />
                    </Form.Item>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                        <Form.Item name="model_kind" label="模型类型" rules={[{ required: true }]}>
                            <Select placeholder="选择类型" className="h-10" popupClassName="rounded-xl">
                                <Select.Option value="text">文本模型</Select.Option>
                                <Select.Option value="multimodal">多模态模型</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item
                        name="api_key"
                        label="API Key"
                        rules={[{ required: !editingProvider, message: '请输入 API Key' }]}
                        tooltip={editingProvider ? "留空表示保持当前密钥不变" : undefined}
                    >
                        <Input.Password
                            prefix={<KeyOutlined className="text-slate-400" />}
                            placeholder={editingProvider ? "留空则不更新" : "sk-..."}
                            className="h-10 rounded-lg"
                        />
                    </Form.Item>

                    <Form.Item name="base_url" label="Base URL (可选)" tooltip="如果使用代理或兼容接口，请输入完整 URL">
                        <Input placeholder="https://api.deepseek.com/v1" className="h-10 rounded-lg" />
                    </Form.Item>

                    <Form.Item name="is_active" label="启用" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ModelConfig;
