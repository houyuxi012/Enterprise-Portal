
import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, message, Badge, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, QuestionCircleOutlined, ApiOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import { LogForwardingConfig } from '../../types';

const LogForwarding: React.FC = () => {
    const [configs, setConfigs] = useState<LogForwardingConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();

    const fetchConfigs = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getLogForwardingConfig();
            setConfigs(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfigs();
    }, []);

    const handleCreate = async (values: any) => {
        try {
            await ApiClient.saveLogForwardingConfig(values);
            message.success('配置已保存');
            setIsModalOpen(false);
            form.resetFields();
            fetchConfigs();
        } catch (error) {
            message.error('保存失败');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteLogForwardingConfig(id);
            message.success('配置已删除');
            fetchConfigs();
        } catch (error) {
            message.error('删除失败');
        }
    };

    const columns = [
        {
            title: '类型',
            dataIndex: 'type',
            key: 'type',
            render: (text: string) => <Tag color="geekblue">{text}</Tag>
        },
        {
            title: '目标地址 (Endpoint)',
            dataIndex: 'endpoint',
            key: 'endpoint',
        },
        {
            title: '端口',
            dataIndex: 'port',
            key: 'port',
            render: (port: number) => port || '-'
        },
        {
            title: '状态',
            dataIndex: 'enabled',
            key: 'enabled',
            render: (enabled: boolean) => (
                <Badge status={enabled ? 'success' : 'default'} text={enabled ? '已启用' : '已禁用'} />
            )
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: LogForwardingConfig) => (
                <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDelete(record.id)}
                >
                    删除
                </Button>
            )
        }
    ];

    // Helper for tag since I didn't import Tag above
    const Tag = ({ color, children }: any) => (
        <span className={`px-2 py-1 rounded text-xs font-bold bg-${color === 'geekblue' ? 'blue' : 'gray'}-100 text-${color === 'geekblue' ? 'blue' : 'gray'}-600`}>
            {children}
        </span>
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">日志外发配置</h1>
                    <p className="text-slate-500">将系统日志转发至第三方 Syslog 或 SIEM 平台</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                    新增配置
                </Button>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
                <Table
                    dataSource={configs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    locale={{ emptyText: '暂无外发配置' }}
                />
            </div>

            <Modal
                title="新增日志外发配置"
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleCreate}
                    initialValues={{ type: 'SYSLOG', enabled: true }}
                >
                    <Form.Item name="type" label="协议类型" rules={[{ required: true }]}>
                        <Select>
                            <Select.Option value="SYSLOG">Syslog (UDP/TCP)</Select.Option>
                            <Select.Option value="WEBHOOK">Webhook (HTTP POST)</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="endpoint"
                        label={
                            <span>
                                服务器地址 / URL&nbsp;
                                <Tooltip title="对于 Syslog 填写 IP，对于 Webhook 填写完整 URL">
                                    <QuestionCircleOutlined />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: '请输入地址' }]}
                    >
                        <Input placeholder="例如: 192.168.1.100 或 https://api.log-server.com" />
                    </Form.Item>

                    <Form.Item name="port" label="端口 (仅 Syslog)">
                        <Input type="number" placeholder="例如: 514" />
                    </Form.Item>

                    <Form.Item name="secret_token" label="Secret Token (仅 Webhook)">
                        <Input.Password placeholder="可选认证 Token" />
                    </Form.Item>

                    <Form.Item name="enabled" label="立即启用" valuePropName="checked">
                        <Switch />
                    </Form.Item>

                    <div className="flex justify-end space-x-2">
                        <Button onClick={() => setIsModalOpen(false)}>取消</Button>
                        <Button type="primary" htmlType="submit">保存</Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
};

export default LogForwarding;
