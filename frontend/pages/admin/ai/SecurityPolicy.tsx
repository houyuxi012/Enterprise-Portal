import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Modal, Form, Input, Select, Switch, message, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import ApiClient from '../../../services/api';
import { AISecurityPolicy } from '../../../types';
import AppButton from '../../../components/AppButton';

const SecurityPolicy: React.FC = () => {
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
            message.error('Failed to fetch policies');
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
            message.success('Policy deleted');
            fetchPolicies();
        } catch (error) {
            message.error('Failed to delete policy');
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
                        message.error('Invalid Rules format. Must be JSON array or comma-separated list.');
                        return;
                    }
                } else {
                    message.error('Invalid JSON format for rules. Example: ["rule1", "rule2"]');
                    return;
                }
            }

            if (editingPolicy) {
                await ApiClient.updateAIPolicy(editingPolicy.id, values);
                message.success('Policy updated');
            } else {
                await ApiClient.createAIPolicy(values);
                message.success('Policy created');
            }
            setIsModalVisible(false);
            fetchPolicies();
        } catch (error) {
            message.error('Operation failed');
        }
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => <span className="font-bold text-slate-700 dark:text-slate-200">{text}</span>
        },
        {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
            render: (text: string) => (
                <Tag color={text === 'keyword' ? 'blue' : text === 'regex' ? 'purple' : 'orange'}>
                    {text.toUpperCase()}
                </Tag>
            )
        },
        {
            title: 'Action',
            dataIndex: 'action',
            key: 'action',
            render: (text: string) => (
                <Tag color={text === 'block' ? 'error' : text === 'mask' ? 'warning' : 'default'}>
                    {text.toUpperCase()}
                </Tag>
            )
        },
        {
            title: 'Content Preview',
            dataIndex: 'content',
            key: 'content',
            render: (text: string) => (
                <code className="text-xs bg-slate-100 dark:bg-slate-900 p-1 rounded text-slate-600 block max-w-xs truncate">
                    {text}
                </code>
            )
        },
        {
            title: 'Status',
            dataIndex: 'is_enabled',
            key: 'is_enabled',
            render: (enabled: boolean) => (
                <Switch checked={enabled} disabled size="small" />
            )
        },
        {
            title: 'Actions',
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
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">安全策略</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">配置内容拦截、关键词过滤与敏感信息脱敏规则</p>
                </div>
                <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加策略</AppButton>
            </div>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                <Table
                    columns={columns}
                    dataSource={policies}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    className="align-middle"
                />
            </Card>

            <Modal
                title={editingPolicy ? "编辑策略" : "添加策略"}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
                okText="保存"
                cancelText="取消"
                className="rounded-2xl overflow-hidden"
                okButtonProps={{ className: "bg-indigo-600" }}
            >
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item name="name" label="策略名称" rules={[{ required: true }]}>
                        <Input placeholder="例如: 财务敏感词拦截" className="h-10 rounded-lg" />
                    </Form.Item>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="type" label="规则类型" rules={[{ required: true }]}>
                            <Select placeholder="选择类型" className="h-10" popupClassName="rounded-xl">
                                <Select.Option value="keyword">关键词匹配</Select.Option>
                                <Select.Option value="regex">正则表达式</Select.Option>
                                <Select.Option value="length">长度限制</Select.Option>
                            </Select>
                        </Form.Item>

                        <Form.Item name="action" label="执行动作" rules={[{ required: true }]}>
                            <Select placeholder="选择动作" className="h-10" popupClassName="rounded-xl">
                                <Select.Option value="block">拦截请求 (Block)</Select.Option>
                                <Select.Option value="mask">掩码脱敏 (Mask)</Select.Option>
                                <Select.Option value="warn">仅记录警告 (Warn)</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item
                        name="content"
                        label="规则内容 (JSON List)"
                        tooltip="请输入字符串数组格式，例如 ['敏感词1', '敏感词2']"
                        rules={[{ required: true }]}
                    >
                        <Input.TextArea rows={4} placeholder='["password", "secret", "机密"]' className="rounded-xl font-mono text-sm" />
                    </Form.Item>

                    <Form.Item name="is_enabled" label="启用策略" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default SecurityPolicy;
