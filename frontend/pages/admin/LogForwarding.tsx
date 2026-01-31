
import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, message, Tooltip, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import { LogForwardingConfig } from '../../types';

// 可选的日志类型
const LOG_TYPE_OPTIONS = [
    { value: 'BUSINESS', label: '业务审计', color: 'blue' },
    { value: 'SYSTEM', label: '系统日志', color: 'default' },
    { value: 'ACCESS', label: '访问日志', color: 'green' },
    { value: 'AI', label: 'AI 审计', color: 'purple' },
    { value: 'LOGIN', label: '登录审计', color: 'orange' },
];

const LogForwarding: React.FC = () => {
    const [configs, setConfigs] = useState<LogForwardingConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();
    const fetchConfigs = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getLogForwardingConfig();
            // Parse log_types if it's a string
            const parsed = data.map((c: any) => ({
                ...c,
                log_types: typeof c.log_types === 'string' ? JSON.parse(c.log_types) : (c.log_types || ['BUSINESS', 'SYSTEM', 'ACCESS'])
            }));
            setConfigs(parsed);
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
            // Ensure log_types is sent as JSON string for backend
            const payload = {
                ...values,
                log_types: values.log_types || ['BUSINESS', 'SYSTEM', 'ACCESS']
            };
            await ApiClient.saveLogForwardingConfig(payload);
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
            title: '协议类型',
            dataIndex: 'type',
            key: 'type',
            width: 120,
            render: (text: string) => <CustomTag color="geekblue">{text}</CustomTag>
        },
        {
            title: '外发日志类型',
            dataIndex: 'log_types',
            key: 'log_types',
            render: (types: string[]) => (
                <div className="flex flex-wrap gap-1">
                    {(types || []).map((t: string) => {
                        const opt = LOG_TYPE_OPTIONS.find(o => o.value === t);
                        return <Tag key={t} color={opt?.color || 'default'}>{opt?.label || t}</Tag>;
                    })}
                </div>
            )
        },
        {
            title: '目标地址',
            dataIndex: 'endpoint',
            key: 'endpoint',
            render: (text: string) => <span className="font-mono text-slate-600 dark:text-slate-300 font-medium text-sm">{text}</span>
        },
        {
            title: '端口',
            dataIndex: 'port',
            key: 'port',
            width: 80,
            render: (port: number) => <span className="font-mono text-slate-500">{port || '-'}</span>
        },
        {
            title: '状态',
            dataIndex: 'enabled',
            key: 'enabled',
            width: 100,
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
            width: 80,
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
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">日志外发</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">配置日志转发至第三方 SIEM / 日志平台</p>
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
                width={520}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleCreate}
                    initialValues={{ type: 'SYSLOG', enabled: true, log_types: ['BUSINESS', 'SYSTEM', 'ACCESS'] }}
                >
                    <Form.Item
                        name="log_types"
                        label="外发日志类型"
                        rules={[{ required: true, message: '请选择至少一种日志类型' }]}
                        extra="选择要转发到该目标的日志类型"
                    >
                        <Select
                            mode="multiple"
                            placeholder="选择日志类型"
                            options={LOG_TYPE_OPTIONS}
                            className="w-full"
                        />
                    </Form.Item>

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
