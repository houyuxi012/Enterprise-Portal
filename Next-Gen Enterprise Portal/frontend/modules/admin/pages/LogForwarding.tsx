
import React, { useEffect, useState } from 'react';
import { App, Card, Col, Form, Input, Row, Select, Space, Statistic, Switch, Tooltip, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, QuestionCircleOutlined, SendOutlined, CheckCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient, { type LogForwardingUpsertPayload } from '@/services/api';
import { LogForwardingConfig } from '@/types';
import { AppButton, AppForm, AppModal, AppPageHeader, AppTable, AppTag } from '@/modules/admin/components/ui';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

const LOG_TYPE_OPTIONS = [
    { value: 'BUSINESS', labelKey: 'business', color: 'blue' },
    { value: 'SYSTEM', labelKey: 'system', color: 'default' },
    { value: 'ACCESS', labelKey: 'access', color: 'green' },
    { value: 'AI', labelKey: 'ai', color: 'purple' },
    { value: 'IAM', labelKey: 'iam', color: 'orange' },
];

const DEFAULT_LOG_TYPES = ['BUSINESS', 'SYSTEM', 'ACCESS'];

const parseLogTypes = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        const normalized = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
        return normalized.length > 0 ? normalized : [...DEFAULT_LOG_TYPES];
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                const normalized = parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
                return normalized.length > 0 ? normalized : [...DEFAULT_LOG_TYPES];
            }
        } catch {
            // ignore parse error and fallback to defaults
        }
    }

    return [...DEFAULT_LOG_TYPES];
};

const LogForwarding: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [configs, setConfigs] = useState<LogForwardingConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = AppForm.useForm();
    const fetchConfigs = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getLogForwardingConfig();
            const parsed: LogForwardingConfig[] = data.map((config) => ({
                ...config,
                log_types: parseLogTypes(config.log_types),
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

    const handleCreate = async (values: LogForwardingUpsertPayload) => {
        try {
            const payload: LogForwardingUpsertPayload = {
                ...values,
                log_types: parseLogTypes(values.log_types),
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
    const logTypeSelectOptions = LOG_TYPE_OPTIONS.map((item) => ({
        value: item.value,
        label: t(`logForwarding.logTypes.${item.labelKey}`),
    }));

    const columns: ColumnsType<LogForwardingConfig> = [
        {
            title: t('logForwarding.table.protocolType'),
            dataIndex: 'type',
            key: 'type',
            width: 120,
            render: (text: string) => <AppTag status="processing">{text}</AppTag>,
        },
        {
            title: t('logForwarding.table.logTypes'),
            dataIndex: 'log_types',
            key: 'log_types',
            render: (types: string[]) => (
                <Space size={[4, 4]} wrap>
                    {(types || []).map((typeCode: string) => {
                        const opt = LOG_TYPE_OPTIONS.find(o => o.value === typeCode);
                        return <AppTag key={typeCode} status={opt?.color === 'green' ? 'success' : opt?.color === 'orange' ? 'warning' : opt?.color === 'purple' ? 'processing' : 'info'}>{opt ? t(`logForwarding.logTypes.${opt.labelKey}`) : typeCode}</AppTag>;
                    })}
                </Space>
            ),
        },
        {
            title: t('logForwarding.table.endpoint'),
            dataIndex: 'endpoint',
            key: 'endpoint',
            render: (text: string) => <Text code>{text}</Text>,
        },
        {
            title: t('logForwarding.table.port'),
            dataIndex: 'port',
            key: 'port',
            width: 80,
            render: (port: number) => <Text type="secondary">{port || '-'}</Text>,
        },
        {
            title: t('logForwarding.table.status'),
            dataIndex: 'enabled',
            key: 'enabled',
            width: 100,
            render: (enabled: boolean) => (
                <AppTag status={enabled ? 'success' : 'default'}>
                    {enabled ? t('logForwarding.status.enabled') : t('logForwarding.status.disabled')}
                </AppTag>
            ),
        },
        {
            title: t('logForwarding.table.actions'),
            key: 'action',
            width: 80,
            render: (_: unknown, record: LogForwardingConfig) => (
                <AppButton intent="danger" size="sm" icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>{t('common.buttons.delete')}</AppButton>
            ),
        }
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('logForwarding.page.title')}
                subtitle={t('logForwarding.page.subtitle')}
                action={(
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                        {t('logForwarding.page.createButton')}
                    </AppButton>
                )}
            />

            {/* Stats Cards */}
            <Row gutter={16} className="mb-4">
                <Col span={8}>
                    <Card className="admin-card">
                        <Statistic
                            title={t('logForwarding.stats.totalConfigs')}
                            value={totalConfigs}
                            prefix={<SettingOutlined />}
                            valueStyle={{ color: '#1890ff' }}
                        />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card className="admin-card">
                        <Statistic
                            title={t('logForwarding.stats.enabled')}
                            value={enabledCount}
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card className="admin-card">
                        <Statistic
                            title={t('logForwarding.stats.syslog')}
                            value={syslogCount}
                            prefix={<SendOutlined />}
                            valueStyle={{ color: '#13c2c2' }}
                        />
                    </Card>
                </Col>
            </Row>



            {/* Forwarding Configs Table */}
            <Card className="admin-card overflow-hidden" title={<Text strong>{t('logForwarding.table.title')}</Text>}>
                <AppTable
                    dataSource={configs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pageSize={10}
                    emptyText={t('logForwarding.table.empty')}
                />
            </Card>

            <AppModal
                title={t('logForwarding.modal.title')}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                width={520}
                onOk={() => form.submit()}
                okText={t('common.buttons.save')}
            >
                <AppForm
                    form={form}
                    layout="vertical"
                    onFinish={handleCreate}
                    initialValues={{ type: 'SYSLOG', enabled: true, log_types: DEFAULT_LOG_TYPES }}
                >
                    <AppForm.Item
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
                    </AppForm.Item>

                    <AppForm.Item name="type" label={t('logForwarding.modal.protocolType')} rules={[{ required: true }]}>
                        <Select>
                            <Select.Option value="SYSLOG">Syslog (UDP/TCP)</Select.Option>
                        </Select>
                    </AppForm.Item>

                    <AppForm.Item
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
                    </AppForm.Item>

                    <AppForm.Item name="port" label={t('logForwarding.modal.port')}>
                        <Input type="number" placeholder={t('logForwarding.placeholders.port')} />
                    </AppForm.Item>

                    <AppForm.Item name="enabled" label={t('logForwarding.modal.enableNow')} valuePropName="checked">
                        <Switch />
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default LogForwarding;
