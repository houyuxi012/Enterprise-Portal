import React, { useEffect, useState } from 'react';
import { App, Card, Col, Input, Row, Select, Space, Switch, Tag, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { AISecurityPolicy } from '@/types';
import { AppButton, AppForm, AppModal, AppPageHeader, AppTable } from '@/modules/admin/components/ui';

const { Text } = Typography;

const SecurityPolicy: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [policies, setPolicies] = useState<AISecurityPolicy[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<AISecurityPolicy | null>(null);
    const [form] = AppForm.useForm();

    const fetchPolicies = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getAIPolicies();
            setPolicies(data);
        } catch (error) {
            message.error(t('securityPolicy.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPolicies();
    }, []);

    const handleAdd = () => {
        setEditingPolicy(null);
        form.resetFields();
        // Default example value
        form.setFieldsValue({ content: '["keyword1", "keyword2"]', is_enabled: true });
        setIsModalVisible(true);
    };

    const handleEdit = (record: AISecurityPolicy) => {
        setEditingPolicy(record);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteAIPolicy(id);
            message.success(t('securityPolicy.messages.deleteSuccess'));
            fetchPolicies();
        } catch (error) {
            message.error(t('securityPolicy.messages.deleteFailed'));
        }
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            // Validate and Auto-fix JSON
            try {
                JSON.parse(values.content);
            } catch (e) {
                // Try to auto-fix if user entered comma separated values
                if (typeof values.content === 'string' && !values.content.trim().startsWith('[')) {
                    try {
                        const list = values.content.split(/,|，/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                        values.content = JSON.stringify(list);
                    } catch (err) {
                        message.error(t('securityPolicy.messages.invalidRuleFormat'));
                        return;
                    }
                } else {
                    message.error(t('securityPolicy.messages.invalidJson'));
                    return;
                }
            }

            if (editingPolicy) {
                await ApiClient.updateAIPolicy(editingPolicy.id, values);
                message.success(t('securityPolicy.messages.updateSuccess'));
            } else {
                await ApiClient.createAIPolicy(values);
                message.success(t('securityPolicy.messages.createSuccess'));
            }
            setIsModalVisible(false);
            fetchPolicies();
        } catch (error) {
            message.error(t('securityPolicy.messages.actionFailed'));
        }
    };

    const columns = [
        {
            title: t('securityPolicy.table.name'),
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => <Text strong>{text}</Text>
        },
        {
            title: t('securityPolicy.table.ruleType'),
            dataIndex: 'type',
            key: 'type',
            render: (text: string) => (
                <Tag color={text === 'keyword' ? 'blue' : text === 'regex' ? 'purple' : 'orange'}>
                    {t(`securityPolicy.ruleType.${text}`, { defaultValue: text.toUpperCase() })}
                </Tag>
            )
        },
        {
            title: t('securityPolicy.table.action'),
            dataIndex: 'action',
            key: 'action',
            render: (text: string) => (
                <Tag color={text === 'block' ? 'error' : text === 'mask' ? 'warning' : 'default'}>
                    {t(`securityPolicy.action.${text}`, { defaultValue: text.toUpperCase() })}
                </Tag>
            )
        },
        {
            title: t('securityPolicy.table.content'),
            dataIndex: 'content',
            key: 'content',
            render: (text: string) => (
                <Text code ellipsis className="block max-w-xs">{text}</Text>
            )
        },
        {
            title: t('securityPolicy.table.status'),
            dataIndex: 'is_enabled',
            key: 'is_enabled',
            render: (enabled: boolean) => (
                <Switch checked={enabled} disabled size="small" />
            )
        },
        {
            title: t('securityPolicy.table.actions'),
            key: 'actions',
            render: (_: any, record: AISecurityPolicy) => (
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
                title={t('securityPolicy.page.title')}
                subtitle={t('securityPolicy.page.subtitle')}
                action={<AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('securityPolicy.page.addButton')}</AppButton>}
            />

            <Card className="admin-card overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={policies}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    locale={{ emptyText: t('securityPolicy.table.empty') }}
                    className="align-middle"
                />
            </Card>

            <AppModal
                title={editingPolicy ? t('securityPolicy.modal.editTitle') : t('securityPolicy.modal.createTitle')}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
                okText={t('common.buttons.save')}
                cancelText={t('common.buttons.cancel')}
            >
                <AppForm form={form} layout="vertical">
                    <AppForm.Item
                        name="name"
                        label={t('securityPolicy.form.name')}
                        rules={[{ required: true, message: t('securityPolicy.form.validation.nameRequired') }]}
                    >
                        <Input placeholder={t('securityPolicy.form.placeholders.name')} />
                    </AppForm.Item>

                    <Card size="small" className="admin-card-subtle">
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                        <AppForm.Item
                            name="type"
                            label={t('securityPolicy.form.ruleType')}
                            rules={[{ required: true, message: t('securityPolicy.form.validation.ruleTypeRequired') }]}
                        >
                            <Select placeholder={t('securityPolicy.form.placeholders.ruleType')}>
                                <Select.Option value="keyword">{t('securityPolicy.ruleType.keyword')}</Select.Option>
                                <Select.Option value="regex">{t('securityPolicy.ruleType.regex')}</Select.Option>
                                <Select.Option value="length">{t('securityPolicy.ruleType.length')}</Select.Option>
                            </Select>
                        </AppForm.Item>
                        </Col>

                        <Col xs={24} md={12}>
                        <AppForm.Item
                            name="action"
                            label={t('securityPolicy.form.action')}
                            rules={[{ required: true, message: t('securityPolicy.form.validation.actionRequired') }]}
                        >
                            <Select placeholder={t('securityPolicy.form.placeholders.action')}>
                                <Select.Option value="block">{t('securityPolicy.action.block')}</Select.Option>
                                <Select.Option value="mask">{t('securityPolicy.action.mask')}</Select.Option>
                                <Select.Option value="warn">{t('securityPolicy.action.warn')}</Select.Option>
                            </Select>
                        </AppForm.Item>
                        </Col>
                    </Row>

                    <AppForm.Item
                        name="content"
                        label={t('securityPolicy.form.content')}
                        tooltip={t('securityPolicy.form.contentTooltip')}
                        rules={[{ required: true, message: t('securityPolicy.form.validation.contentRequired') }]}
                    >
                        <Input.TextArea rows={4} placeholder={t('securityPolicy.form.placeholders.content')} />
                    </AppForm.Item>

                    <AppForm.Item name="is_enabled" label={t('securityPolicy.form.enabled')} valuePropName="checked">
                        <Switch />
                    </AppForm.Item>
                    </Card>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default SecurityPolicy;
