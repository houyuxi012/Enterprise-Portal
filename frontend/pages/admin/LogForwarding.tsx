
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



    // Helper for tag since I didn't import Tag above
    const CustomTag = ({ color, children }: any) => (
        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${color === 'geekblue' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
            {children}
        </span>
    );

    const columns = [
        {
            title: '类型',
            dataIndex: 'type',
            key: 'type',
            render: (text: string) => <CustomTag color="geekblue">{text}</CustomTag>
        },
        {
            title: '目标地址 (Endpoint)',
            dataIndex: 'endpoint',
            key: 'endpoint',
            render: (text: string) => <span className="font-mono text-slate-600 dark:text-slate-300 font-medium">{text}</span>
        },
        {
            title: '端口',
            dataIndex: 'port',
            key: 'port',
            render: (port: number) => <span className="font-mono text-slate-500">{port || '-'}</span>
        },
        {
            title: '状态',
            dataIndex: 'enabled',
            key: 'enabled',
            render: (enabled: boolean) => (
                <span className={`flex items-center text-xs font-bold ${enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <span className={`w-2 h-2 rounded-full mr-2 ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                    {enabled ? '已启用' : '已禁用'}
                </span>
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
                    className="font-bold hover:bg-rose-50 rounded-lg"
                >
                    删除
                </Button>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">日志外发与存储</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">配置日志存储策略及第三方转发</p>
                </div>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setIsModalOpen(true)}
                    size="large"
                    className="rounded-xl px-6 bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-900/20 border-0 h-10 font-bold transition-all hover:scale-105 active:scale-95"
                >
                    新增外发配置
                </Button>
            </div>



            {/* Forwarding Configs Table */}
            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center">
                    <span className="w-1 h-6 bg-emerald-500 rounded-full mr-3"></span>
                    外发规则列表
                </h3>
                <Table
                    dataSource={configs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    locale={{ emptyText: '暂无外发配置' }}
                    className="ant-table-custom"
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
