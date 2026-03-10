import React, { useEffect, useState } from 'react';
import { App, Badge, Card, Col, Input, Row, Select, Space, Switch, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, ApiOutlined, KeyOutlined, RobotOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { AIProvider } from '@/types';
import { AppButton, AppForm, AppModal, AppPageHeader, AppTable, AppTag } from '@/modules/admin/components/ui';

const { Text } = Typography;

const ModelConfig: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [providers, setProviders] = useState<AIProvider[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
    const [form] = AppForm.useForm();

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
                <Space size="small">
                    <Text strong>{text}</Text>
                    {record.is_active && <AppTag status="success">{t('modelConfig.table.activeTag')}</AppTag>}
                </Space>
            ),
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
                return <AppTag status={colors[text] === 'green' ? 'success' : colors[text] === 'orange' ? 'warning' : colors[text] === 'purple' ? 'processing' : 'info'}>{text.toUpperCase()}</AppTag>;
            }
        },
        {
            title: t('modelConfig.table.modelId'),
            dataIndex: 'model',
            key: 'model',
            render: (text: string) => <Text code>{text}</Text>,
        },
        {
            title: t('modelConfig.table.modelKind'),
            dataIndex: 'model_kind',
            key: 'model_kind',
            render: (kind: AIProvider['model_kind']) => (
                kind === 'multimodal'
                    ? <AppTag status="processing">{t('modelConfig.modelKind.multimodal')}</AppTag>
                    : <AppTag status="info">{t('modelConfig.modelKind.text')}</AppTag>
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
                <Space size="small">
                    <AppButton intent="tertiary" iconOnly size="sm" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <AppButton intent="danger" iconOnly size="sm" icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
                </Space>
            )
        }
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('modelConfig.page.title')}
                subtitle={t('modelConfig.page.subtitle')}
                action={<AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('modelConfig.page.addButton')}</AppButton>}
            />

            <Card className="admin-card overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={providers}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    className="align-middle"
                />
            </Card>

            <AppModal
                title={editingProvider ? t('modelConfig.modal.editTitle') : t('modelConfig.modal.createTitle')}
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
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
                <AppForm form={form} layout="vertical">
                    <Card size="small" className="admin-card-subtle">
                        <AppForm.Item name="name" label={t('modelConfig.form.name')} rules={[{ required: true, message: t('modelConfig.form.validation.nameRequired') }]}>
                            <Input prefix={<ApiOutlined />} placeholder={t('modelConfig.form.placeholders.name')} />
                        </AppForm.Item>

                        <Row gutter={16}>
                            <Col xs={24} md={8}>
                                <AppForm.Item name="type" label={t('modelConfig.form.providerType')} rules={[{ required: true, message: t('modelConfig.form.validation.providerTypeRequired') }]}>
                                    <Select placeholder={t('modelConfig.form.placeholders.providerType')}>
                                        <Select.Option value="openai">OpenAI</Select.Option>
                                        <Select.Option value="deepseek">DeepSeek</Select.Option>
                                        <Select.Option value="gemini">Google Gemini</Select.Option>
                                        <Select.Option value="dashscope">{t('modelConfig.providers.dashscope')}</Select.Option>
                                        <Select.Option value="zhipu">{t('modelConfig.providers.zhipu')}</Select.Option>
                                    </Select>
                                </AppForm.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <AppForm.Item name="model" label={t('modelConfig.form.modelId')} rules={[{ required: true, message: t('modelConfig.form.validation.modelIdRequired') }]}>
                                    <Input prefix={<RobotOutlined />} placeholder={t('modelConfig.form.placeholders.modelId')} />
                                </AppForm.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <AppForm.Item name="model_kind" label={t('modelConfig.form.modelKind')} rules={[{ required: true, message: t('modelConfig.form.validation.modelKindRequired') }]}>
                                    <Select placeholder={t('modelConfig.form.placeholders.modelKind')}>
                                        <Select.Option value="text">{t('modelConfig.modelKind.textModel')}</Select.Option>
                                        <Select.Option value="multimodal">{t('modelConfig.modelKind.multimodalModel')}</Select.Option>
                                    </Select>
                                </AppForm.Item>
                            </Col>
                        </Row>

                        <AppForm.Item
                            name="api_key"
                            label={t('modelConfig.form.apiKey')}
                            rules={[{ required: !editingProvider, message: t('modelConfig.form.validation.apiKeyRequired') }]}
                            tooltip={editingProvider ? t('modelConfig.form.apiKeyTooltip') : undefined}
                        >
                            <Input.Password
                                prefix={<KeyOutlined />}
                                placeholder={editingProvider ? t('modelConfig.form.placeholders.apiKeyKeep') : t('modelConfig.form.placeholders.apiKey')}
                            />
                        </AppForm.Item>

                        <Row gutter={16}>
                            <Col xs={24} md={12}>
                                <AppForm.Item name="base_url" label={t('modelConfig.form.baseUrl')} tooltip={t('modelConfig.form.baseUrlTooltip')}>
                                    <Input placeholder="https://api.deepseek.com/v1" />
                                </AppForm.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <AppForm.Item name="is_active" label={t('modelConfig.form.enabled')} valuePropName="checked">
                                    <Switch />
                                </AppForm.Item>
                            </Col>
                        </Row>
                    </Card>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default ModelConfig;
