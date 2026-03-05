import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Modal, Form, Input, Select, Switch, message, Badge } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, ApiOutlined, KeyOutlined, RobotOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { AIProvider } from '@/types';
import AppButton from '@/components/AppButton';


const ModelConfig: React.FC = () => {
    const { t } = useTranslation();
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
            message.error(t('modelConfig.messages.loadFailed'));
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
            message.success(t('modelConfig.messages.deleteSuccess'));
            fetchProviders();
        } catch (error) {
            message.error(t('modelConfig.messages.deleteFailed'));
        }
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();

            // Encryption handled by backend at rest (TLS in transit)


            if (editingProvider) {
                await ApiClient.updateAIProvider(editingProvider.id, values);
                message.success(t('modelConfig.messages.updateSuccess'));
            } else {
                await ApiClient.createAIProvider(values);
                message.success(t('modelConfig.messages.createSuccess'));
            }
            setIsModalVisible(false);
            fetchProviders();
        } catch (error) {
            console.error(error);
            message.error(t('modelConfig.messages.actionFailed'));
        }
    };

    const columns = [
        {
            title: t('modelConfig.table.name'),
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: AIProvider) => (
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{text}</span>
                    {record.is_active && <Tag color="green" icon={<CheckCircleOutlined />}>{t('modelConfig.table.activeTag')}</Tag>}
                </div>
            )
        },
        {
            title: t('modelConfig.table.providerType'),
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
            title: t('modelConfig.table.modelId'),
            dataIndex: 'model',
            key: 'model',
            render: (text: string) => (
                <Tag icon={<RobotOutlined />} className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    {text}
                </Tag>
            )
        },
        {
            title: t('modelConfig.table.modelKind'),
            dataIndex: 'model_kind',
            key: 'model_kind',
            render: (kind: AIProvider['model_kind']) => (
                kind === 'multimodal'
                    ? <Tag color="magenta">{t('modelConfig.modelKind.multimodal')}</Tag>
                    : <Tag color="geekblue">{t('modelConfig.modelKind.text')}</Tag>
            )
        },
        {
            title: t('modelConfig.table.status'),
            dataIndex: 'is_active',
            key: 'is_active',
            render: (isActive: boolean) => (
                <Badge status={isActive ? 'success' : 'default'} text={isActive ? t('modelConfig.status.enabled') : t('modelConfig.status.disabled')} />
            )
        },
        {
            title: t('modelConfig.table.actions'),
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
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{t('modelConfig.page.title')}</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{t('modelConfig.page.subtitle')}</p>
                </div>
                <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('modelConfig.page.addButton')}</AppButton>
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
                title={editingProvider ? t('modelConfig.modal.editTitle') : t('modelConfig.modal.createTitle')}
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                className="rounded-2xl overflow-hidden"
                footer={[
                    <AppButton key="test" intent="secondary" icon={<ApiOutlined />} onClick={async () => {
                        try {
                            const values = await form.validateFields();
                            const hide = message.loading(t('modelConfig.messages.testingConnection'), 0);
                            try {
                                const res = await ApiClient.testAIProvider(values);
                                hide();
                                if (res.status === 'success') {
                                    message.success(t('modelConfig.messages.connectionSuccess'));
                                } else {
                                    message.error(res.message || t('modelConfig.messages.connectionFailed'));
                                }
                            } catch (err: any) {
                                hide();
                                message.error(err.response?.data?.detail || t('modelConfig.messages.connectionFailed'));
                            }
                        } catch (e) {
                            // Validation failed
                        }
                    }}>{t('modelConfig.modal.testConnection')}</AppButton>,
                    <AppButton key="cancel" intent="secondary" onClick={() => setIsModalVisible(false)}>{t('common.buttons.cancel')}</AppButton>,
                    <AppButton key="submit" intent="primary" onClick={handleOk}>{t('common.buttons.save')}</AppButton>,
                ]}
            >
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item name="name" label={t('modelConfig.form.name')} rules={[{ required: true, message: t('modelConfig.form.validation.nameRequired') }]}>
                        <Input prefix={<ApiOutlined className="text-slate-400" />} placeholder={t('modelConfig.form.placeholders.name')} className="h-10 rounded-lg" />
                    </Form.Item>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Form.Item name="type" label={t('modelConfig.form.providerType')} rules={[{ required: true, message: t('modelConfig.form.validation.providerTypeRequired') }]}>
                            <Select placeholder={t('modelConfig.form.placeholders.providerType')} className="h-10" popupClassName="rounded-xl">
                                <Select.Option value="openai">OpenAI</Select.Option>
                                <Select.Option value="deepseek">DeepSeek</Select.Option>
                                <Select.Option value="gemini">Google Gemini</Select.Option>
                                <Select.Option value="dashscope">{t('modelConfig.providers.dashscope')}</Select.Option>
                                <Select.Option value="zhipu">{t('modelConfig.providers.zhipu')}</Select.Option>
                            </Select>
                        </Form.Item>

                        <Form.Item name="model" label={t('modelConfig.form.modelId')} rules={[{ required: true, message: t('modelConfig.form.validation.modelIdRequired') }]}>
                            <Input prefix={<RobotOutlined className="text-slate-400" />} placeholder={t('modelConfig.form.placeholders.modelId')} className="h-10 rounded-lg" />
                        </Form.Item>

                        <Form.Item name="model_kind" label={t('modelConfig.form.modelKind')} rules={[{ required: true, message: t('modelConfig.form.validation.modelKindRequired') }]}>
                            <Select placeholder={t('modelConfig.form.placeholders.modelKind')} className="h-10" popupClassName="rounded-xl">
                                <Select.Option value="text">{t('modelConfig.modelKind.textModel')}</Select.Option>
                                <Select.Option value="multimodal">{t('modelConfig.modelKind.multimodalModel')}</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item
                        name="api_key"
                        label={t('modelConfig.form.apiKey')}
                        rules={[{ required: !editingProvider, message: t('modelConfig.form.validation.apiKeyRequired') }]}
                        tooltip={editingProvider ? t('modelConfig.form.apiKeyTooltip') : undefined}
                    >
                        <Input.Password
                            prefix={<KeyOutlined className="text-slate-400" />}
                            placeholder={editingProvider ? t('modelConfig.form.placeholders.apiKeyKeep') : t('modelConfig.form.placeholders.apiKey')}
                            className="h-10 rounded-lg"
                        />
                    </Form.Item>

                    <Form.Item name="base_url" label={t('modelConfig.form.baseUrl')} tooltip={t('modelConfig.form.baseUrlTooltip')}>
                        <Input placeholder="https://api.deepseek.com/v1" className="h-10 rounded-lg" />
                    </Form.Item>

                    <Form.Item name="is_active" label={t('modelConfig.form.enabled')} valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ModelConfig;
