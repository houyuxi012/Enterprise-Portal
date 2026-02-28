import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Modal, Form, Input, Select, Switch, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '../../../services/api';
import { AISecurityPolicy } from '../../../types';
import AppButton from '../../../components/AppButton';

const SecurityPolicy: React.FC = () => {
    const { t } = useTranslation();
    const [policies, setPolicies] = useState<AISecurityPolicy[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<AISecurityPolicy | null>(null);
    const [form] = Form.useForm();

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
            render: (text: string) => <span className="font-bold text-slate-700 dark:text-slate-200">{text}</span>
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
                <code className="text-xs bg-slate-100 dark:bg-slate-900 p-1 rounded text-slate-600 block max-w-xs truncate">
                    {text}
                </code>
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
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{t('securityPolicy.page.title')}</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{t('securityPolicy.page.subtitle')}</p>
                </div>
                <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('securityPolicy.page.addButton')}</AppButton>
            </div>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                <Table
                    columns={columns}
                    dataSource={policies}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    locale={{ emptyText: t('securityPolicy.table.empty') }}
                    className="align-middle"
                />
            </Card>

            <Modal
                title={editingPolicy ? t('securityPolicy.modal.editTitle') : t('securityPolicy.modal.createTitle')}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
                okText={t('common.buttons.save')}
                cancelText={t('common.buttons.cancel')}
                className="rounded-2xl overflow-hidden"
                okButtonProps={{ className: "bg-indigo-600" }}
            >
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item
                        name="name"
                        label={t('securityPolicy.form.name')}
                        rules={[{ required: true, message: t('securityPolicy.form.validation.nameRequired') }]}
                    >
                        <Input placeholder={t('securityPolicy.form.placeholders.name')} className="h-10 rounded-lg" />
                    </Form.Item>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item
                            name="type"
                            label={t('securityPolicy.form.ruleType')}
                            rules={[{ required: true, message: t('securityPolicy.form.validation.ruleTypeRequired') }]}
                        >
                            <Select placeholder={t('securityPolicy.form.placeholders.ruleType')} className="h-10" popupClassName="rounded-xl">
                                <Select.Option value="keyword">{t('securityPolicy.ruleType.keyword')}</Select.Option>
                                <Select.Option value="regex">{t('securityPolicy.ruleType.regex')}</Select.Option>
                                <Select.Option value="length">{t('securityPolicy.ruleType.length')}</Select.Option>
                            </Select>
                        </Form.Item>

                        <Form.Item
                            name="action"
                            label={t('securityPolicy.form.action')}
                            rules={[{ required: true, message: t('securityPolicy.form.validation.actionRequired') }]}
                        >
                            <Select placeholder={t('securityPolicy.form.placeholders.action')} className="h-10" popupClassName="rounded-xl">
                                <Select.Option value="block">{t('securityPolicy.action.block')}</Select.Option>
                                <Select.Option value="mask">{t('securityPolicy.action.mask')}</Select.Option>
                                <Select.Option value="warn">{t('securityPolicy.action.warn')}</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item
                        name="content"
                        label={t('securityPolicy.form.content')}
                        tooltip={t('securityPolicy.form.contentTooltip')}
                        rules={[{ required: true, message: t('securityPolicy.form.validation.contentRequired') }]}
                    >
                        <Input.TextArea rows={4} placeholder={t('securityPolicy.form.placeholders.content')} className="rounded-xl font-mono text-sm" />
                    </Form.Item>

                    <Form.Item name="is_enabled" label={t('securityPolicy.form.enabled')} valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default SecurityPolicy;
