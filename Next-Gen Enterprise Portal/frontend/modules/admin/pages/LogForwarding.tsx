
import React, { useEffect, useState } from 'react';
import { Table, Modal, Form, Input, Select, Switch, message, Tooltip, Tag, Card, Statistic, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined, QuestionCircleOutlined, ReloadOutlined, ApiOutlined, SendOutlined, CheckCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { LogForwardingConfig } from '@/types';
import AppButton from '@/components/AppButton';

const LOG_TYPE_OPTIONS = [
    { value: 'BUSINESS', labelKey: 'business', color: 'blue' },
    { value: 'SYSTEM', labelKey: 'system', color: 'default' },
    { value: 'ACCESS', labelKey: 'access', color: 'green' },
    { value: 'AI', labelKey: 'ai', color: 'purple' },
    { value: 'IAM', labelKey: 'iam', color: 'orange' },
];

const LogForwarding: React.FC = () => {
    const { t } = useTranslation();
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
            message.success(t('logForwarding.messages.saveSuccess'));
            setIsModalOpen(false);
            form.resetFields();
            fetchConfigs();
        } catch (error) {
            message.error(t('logForwarding.messages.saveFailed'));
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteLogForwardingConfig(id);
            message.success(t('logForwarding.messages.deleteSuccess'));
            fetchConfigs();
        } catch (error) {
            message.error(t('logForwarding.messages.deleteFailed'));
        }
    };

    // Calculate stats
    const totalConfigs = configs.length;
    const enabledCount = configs.filter(c => c.enabled).length;
    const syslogCount = configs.filter(c => c.type === 'SYSLOG').length;
    const webhookCount = configs.filter(c => c.type === 'WEBHOOK').length;
    const logTypeSelectOptions = LOG_TYPE_OPTIONS.map((item) => ({
        value: item.value,
        label: t(`logForwarding.logTypes.${item.labelKey}`),
    }));

    const columns = [
        {
            title: t('logForwarding.table.protocolType'),
            dataIndex: 'type',
            key: 'type',
            width: 120,
            render: (text: string) => <Tag color="geekblue">{text}</Tag>
        },
        {
            title: t('logForwarding.table.logTypes'),
            dataIndex: 'log_types',
            key: 'log_types',
            render: (types: string[]) => (
                <div className="flex flex-wrap gap-1">
                    {(types || []).map((typeCode: string) => {
                        const opt = LOG_TYPE_OPTIONS.find(o => o.value === typeCode);
                        return <Tag key={typeCode} color={opt?.color || 'default'}>{opt ? t(`logForwarding.logTypes.${opt.labelKey}`) : typeCode}</Tag>;
                    })}
                </div>
            )
        },
        {
            title: t('logForwarding.table.endpoint'),
            dataIndex: 'endpoint',
            key: 'endpoint',
            render: (text: string) => <span className="font-mono text-slate-600 dark:text-slate-300 font-medium text-sm">{text}</span>
        },
        {
            title: t('logForwarding.table.port'),
            dataIndex: 'port',
            key: 'port',
            width: 80,
            render: (port: number) => <span className="font-mono text-slate-500">{port || '-'}</span>
        },
        {
            title: t('logForwarding.table.status'),
            dataIndex: 'enabled',
            key: 'enabled',
            width: 100,
            render: (enabled: boolean) => (
                <span className={`flex items-center text-xs font-bold ${enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <span className={`w-2 h-2 rounded-full mr-2 ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                    {enabled ? t('logForwarding.status.enabled') : t('logForwarding.status.disabled')}
                </span>
            )
        },
        {
            title: t('logForwarding.table.actions'),
            key: 'action',
            width: 80,
            render: (_: any, record: LogForwardingConfig) => (
                <AppButton intent="danger" size="sm" icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>{t('common.buttons.delete')}</AppButton>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t('logForwarding.page.title')}</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">{t('logForwarding.page.subtitle')}</p>
                </div>
                <AppButton intent="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>{t('logForwarding.page.createButton')}</AppButton>
            </div>

            {/* Stats Cards */}
            <Row gutter={16} className="mb-4">
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic
                            title={t('logForwarding.stats.totalConfigs')}
                            value={totalConfigs}
                            prefix={<SettingOutlined />}
                            valueStyle={{ color: '#1890ff' }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic
                            title={t('logForwarding.stats.enabled')}
                            value={enabledCount}
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic
                            title={t('logForwarding.stats.syslog')}
                            value={syslogCount}
                            prefix={<SendOutlined />}
                            valueStyle={{ color: '#13c2c2' }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic
                            title={t('logForwarding.stats.webhook')}
                            value={webhookCount}
                            prefix={<ApiOutlined />}
                            valueStyle={{ color: '#722ed1' }}
                        />
                    </Card>
                </Col>
            </Row>



            {/* Forwarding Configs Table */}
            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center">
                    <span className="w-1 h-6 bg-emerald-500 rounded-full mr-3"></span>
                    {t('logForwarding.table.title')}
                </h3>
                <Table
                    dataSource={configs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    locale={{ emptyText: t('logForwarding.table.empty') }}
                    className="ant-table-custom"
                />
            </div>

            <Modal
                title={t('logForwarding.modal.title')}
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
                        label={t('logForwarding.modal.logTypes')}
                        rules={[{ required: true, message: t('logForwarding.validation.logTypesRequired') }]}
                        extra={t('logForwarding.modal.logTypesExtra')}
                    >
                        <Select
                            mode="multiple"
                            placeholder={t('logForwarding.placeholders.logTypes')}
                            options={logTypeSelectOptions}
                            className="w-full"
                        />
                    </Form.Item>

                    <Form.Item name="type" label={t('logForwarding.modal.protocolType')} rules={[{ required: true }]}>
                        <Select>
                            <Select.Option value="SYSLOG">Syslog (UDP/TCP)</Select.Option>
                            <Select.Option value="WEBHOOK">Webhook (HTTP POST)</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="endpoint"
                        label={
                            <span>
                                {t('logForwarding.modal.endpointLabel')}&nbsp;
                                <Tooltip title={t('logForwarding.modal.endpointTooltip')}>
                                    <QuestionCircleOutlined />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: t('logForwarding.validation.endpointRequired') }]}
                    >
                        <Input placeholder={t('logForwarding.placeholders.endpoint')} />
                    </Form.Item>

                    <Form.Item name="port" label={t('logForwarding.modal.port')}>
                        <Input type="number" placeholder={t('logForwarding.placeholders.port')} />
                    </Form.Item>

                    <Form.Item name="secret_token" label={t('logForwarding.modal.secretToken')}>
                        <Input.Password placeholder={t('logForwarding.placeholders.secretToken')} />
                    </Form.Item>

                    <Form.Item name="enabled" label={t('logForwarding.modal.enableNow')} valuePropName="checked">
                        <Switch />
                    </Form.Item>

                    <div className="flex justify-end space-x-2">
                        <AppButton intent="secondary" onClick={() => setIsModalOpen(false)}>{t('common.buttons.cancel')}</AppButton>
                        <AppButton intent="primary" htmlType="submit">{t('common.buttons.save')}</AppButton>
                    </div>
                </Form>
            </Modal>
        </div>
    );
};

export default LogForwarding;
