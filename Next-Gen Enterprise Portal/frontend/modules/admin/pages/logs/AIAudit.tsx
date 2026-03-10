import React, { useEffect, useState } from 'react';
import { App, Card, Col, Descriptions, Row, Space, Statistic, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, StopOutlined, ClockCircleOutlined, RobotOutlined, DatabaseOutlined, CloudOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient, { type AIAuditLogEntry, type AIAuditQueryParams } from '@/services/api';
import dayjs from 'dayjs';
import { AppButton, AppDrawer, AppFilterBar, AppPageHeader, AppTable } from '@/modules/admin/components/ui';

const { Text } = Typography;

type AIAuditLog = AIAuditLogEntry;

interface AuditStats {
    period_days: number;
    total_requests: number;
    success_count: number;
    blocked_count: number;
    error_count: number;
    success_rate: number;
    avg_latency_ms: number;
    total_tokens_in: number;
    total_tokens_out: number;
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
    SUCCESS: { color: 'green', icon: <CheckCircleOutlined /> },
    BLOCKED: { color: 'orange', icon: <StopOutlined /> },
    ERROR: { color: 'red', icon: <CloseCircleOutlined /> },
    TIMEOUT: { color: 'volcano', icon: <ClockCircleOutlined /> },
};

const normalizeSourceParts = (source?: string): string[] => {
    const raw = String(source || 'db').replace(/\+/g, ',').toLowerCase();
    const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
    return parts.length > 0 ? [...new Set(parts)] : ['db'];
};

const AIAudit: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [logs, setLogs] = useState<AIAuditLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<AuditStats | null>(null);
    const [selectedLog, setSelectedLog] = useState<AIAuditLog | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Filters
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
    const [statusFilter, setStatusFilter] = useState<string | undefined>();
    const [providerFilter, setProviderFilter] = useState<string | undefined>();
    const [sourceFilter, setSourceFilter] = useState<string>('all');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params: AIAuditQueryParams = {
                source: sourceFilter,
                limit: 100
            };
            if (dateRange[0]) params.start_time = dateRange[0].toISOString();
            if (dateRange[1]) params.end_time = dateRange[1].toISOString();
            if (statusFilter) params.status = statusFilter;
            if (providerFilter) params.provider = providerFilter;

            const data = await ApiClient.getAIAuditLogs(params);
            setLogs(data);
        } catch (error) {
            console.error('Failed to fetch AI audit logs:', error);
            message.error(t('aiAudit.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const data = await ApiClient.getAIAuditStats(7);
            setStats(data);
        } catch (error) {
            console.error('Failed to fetch AI audit stats:', error);
            message.error(t('aiAudit.messages.statsLoadFailed'));
        }
    };

    useEffect(() => {
        void fetchLogs();
        void fetchStats();
    }, [sourceFilter]);

    const handleViewDetail = async (record: AIAuditLog) => {
        try {
            const detail = await ApiClient.getAIAuditDetail(record.event_id);
            setSelectedLog(detail);
            setDrawerOpen(true);
        } catch (error) {
            // Fallback to table data if DB query fails (e.g. Loki-only record)
            setSelectedLog(record);
            setDrawerOpen(true);
        }
    };

    const columns = [
        {
            title: t('aiAudit.table.time'),
            dataIndex: 'ts',
            key: 'ts',
            width: 180,
            render: (ts: string) => <Text type="secondary">{dayjs(ts).format('YYYY-MM-DD HH:mm:ss')}</Text>
        },
        {
            title: t('aiAudit.table.user'),
            dataIndex: 'actor_id',
            key: 'actor_id',
            width: 100,
            render: (id: number, record: AIAuditLog) => (
                <Text>
                    {id ? `#${id}` : record.actor_type}
                </Text>
            )
        },
        {
            title: t('aiAudit.table.model'),
            key: 'model',
            width: 180,
            render: (_: unknown, record: AIAuditLog) => (
                <Space size="small">
                    <RobotOutlined />
                    <Text code>{record.provider || '-'}</Text>
                    <Text type="secondary">/</Text>
                    <Text code>{record.model?.split('-').pop() || '-'}</Text>
                </Space>
            )
        },
        {
            title: t('aiAudit.table.status'),
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string) => {
                const config = STATUS_CONFIG[status] || { color: 'default', icon: null };
                return <Tag color={config.color} icon={config.icon}>{t(`aiAudit.status.${status}`, { defaultValue: status })}</Tag>;
            }
        },
        {
            title: t('aiAudit.table.policyCheck'),
            key: 'policy',
            width: 140,
            render: (_: unknown, record: AIAuditLog) => (
                <Space size="small">
                    <Tooltip title={t('aiAudit.table.inputCheck')}>
                        <Tag color={record.input_policy_result === 'BLOCK' ? 'red' : 'blue'} className="text-xs">
                            {t('aiAudit.table.input')}: {record.input_policy_result || '-'}
                        </Tag>
                    </Tooltip>
                </Space>
            )
        },
        {
            title: t('aiAudit.table.latency'),
            dataIndex: 'latency_ms',
            key: 'latency_ms',
            width: 80,
            render: (ms: number) => (
                <Text code type={ms > 3000 ? undefined : 'secondary'} style={ms > 3000 ? { color: '#fa8c16' } : undefined}>
                    {ms ? `${ms}ms` : '-'}
                </Text>
            )
        },
        {
            title: 'Token',
            key: 'tokens',
            width: 100,
            render: (_: unknown, record: AIAuditLog) => (
                <Text code>
                    {record.tokens_in || 0} / {record.tokens_out || 0}
                </Text>
            )
        },
        {
            title: t('aiAudit.table.source'),
            dataIndex: 'source',
            key: 'source',
            width: 100,
            render: (source: string) => {
                const sources = normalizeSourceParts(source);
                if (sources.length > 1) {
                    return (
                        <Space size={[4, 4]} wrap>
                            {sources.map((src, i) => (
                                <Tag key={i} color={src === 'loki' ? 'purple' : 'cyan'} className="text-xs">
                                    {src === 'loki' ? 'Loki' : 'DB'}
                                </Tag>
                            ))}
                        </Space>
                    );
                }
                return (
                    <Tag color={sources[0] === 'loki' ? 'purple' : 'cyan'} className="text-xs">
                        {sources[0] === 'loki' ? 'Loki' : 'DB'}
                    </Tag>
                );
            }
        },
        {
            title: t('aiAudit.table.actions'),
            key: 'action',
            width: 80,
            render: (_: unknown, record: AIAuditLog) => (
                <AppButton intent="tertiary" size="sm" onClick={() => handleViewDetail(record)}>
                    {t('common.buttons.detail')}
                </AppButton>
            )
        }
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('aiAudit.page.title')}
                subtitle={t('aiAudit.page.subtitle')}
                action={
                    <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={() => { void fetchLogs(); void fetchStats(); }} loading={loading}>
                        {t('common.buttons.refresh')}
                    </AppButton>
                }
            />

            {/* Stats Cards - AI Specific */}
            {stats && (
                <Row gutter={16} className="mb-4">
                    <Col span={6}>
                        <Card className="admin-card">
                            <Statistic
                                title={t('aiAudit.stats.totalRequests7d')}
                                value={stats.total_requests}
                                prefix={<RobotOutlined />}
                                valueStyle={{ color: '#1890ff' }}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card className="admin-card">
                            <Statistic
                                title={t('aiAudit.stats.successRate')}
                                value={stats.success_rate}
                                suffix="%"
                                valueStyle={{ color: stats.success_rate > 90 ? '#52c41a' : '#faad14' }}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card className="admin-card">
                            <Statistic
                                title={t('aiAudit.stats.blockedCount')}
                                value={stats.blocked_count}
                                prefix={<StopOutlined />}
                                valueStyle={{ color: stats.blocked_count > 0 ? '#ff7a45' : '#52c41a' }}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card className="admin-card">
                            <Statistic
                                title={t('aiAudit.stats.avgLatency')}
                                value={stats.avg_latency_ms}
                                suffix="ms"
                                prefix={<ClockCircleOutlined />}
                                valueStyle={{ color: '#722ed1' }}
                            />
                        </Card>
                    </Col>
                </Row>
            )}

            {/* Filters */}
            <AppFilterBar>
                <AppFilterBar.DateRange
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
                    placeholder={[t('aiAudit.filters.startTime'), t('aiAudit.filters.endTime')]}
                />
                <AppFilterBar.Select
                    placeholder={t('aiAudit.filters.status')}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    width={140}
                    options={[
                        { value: 'SUCCESS', label: t('aiAudit.status.SUCCESS') },
                        { value: 'BLOCKED', label: t('aiAudit.status.BLOCKED') },
                        { value: 'ERROR', label: t('aiAudit.status.ERROR') },
                    ]}
                />
                <AppFilterBar.Select
                    placeholder={t('aiAudit.filters.provider')}
                    value={providerFilter}
                    onChange={setProviderFilter}
                    width={160}
                    options={[
                        { value: 'gemini', label: 'Gemini' },
                        { value: 'openai', label: 'OpenAI' },
                        { value: 'deepseek', label: 'DeepSeek' },
                        { value: 'qwen', label: 'Qwen' },
                    ]}
                />
                <AppFilterBar.Select
                    value={sourceFilter}
                    onChange={setSourceFilter}
                    width={140}
                    allowClear={false}
                    options={[
                        { value: 'db', label: <span className="flex items-center gap-1"><DatabaseOutlined />DB</span> },
                        { value: 'loki', label: <span className="flex items-center gap-1"><CloudOutlined />Loki</span> },
                        { value: 'all', label: t('common.status.all') },
                    ]}
                />
                <AppFilterBar.Action>
                    <AppButton intent="primary" onClick={() => { void fetchLogs(); }} loading={loading}>
                        {t('common.buttons.query')}
                    </AppButton>
                </AppFilterBar.Action>
            </AppFilterBar>

            {/* Table */}
            <Card className="admin-card">
                <AppTable
                    dataSource={logs}
                    columns={columns}
                    rowKey="event_id"
                    loading={loading}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    scroll={{ x: 1200 }}
                    locale={{ emptyText: t('aiAudit.table.empty') }}
                    className="ant-table-custom"
                />
            </Card>

            {/* Detail Drawer */}
            <AppDrawer
                title={t('aiAudit.drawer.title')}
                width={600}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                hideFooter
            >
                {selectedLog && (
                    <div className="space-y-6">
                        <Descriptions bordered column={1} size="small">
                            <Descriptions.Item label={t('aiAudit.drawer.eventId')}>
                                <code className="text-xs">{selectedLog.event_id}</code>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.time')}>
                                {dayjs(selectedLog.ts).format('YYYY-MM-DD HH:mm:ss')}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.user')}>
                                {selectedLog.actor_type} (ID: {selectedLog.actor_id || '-'})
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.ip')}>
                                {selectedLog.actor_ip || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.model')}>
                                {selectedLog.provider} / {selectedLog.model}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.status')}>
                                <Tag color={STATUS_CONFIG[selectedLog.status]?.color || 'default'}>
                                    {t(`aiAudit.status.${selectedLog.status}`, { defaultValue: selectedLog.status })}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.inputPolicy')}>
                                {selectedLog.input_policy_result || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.outputPolicy')}>
                                {selectedLog.output_policy_result || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.policyHits')}>
                                {selectedLog.policy_hits || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.latency')}>
                                {selectedLog.latency_ms || 0} ms
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.tokens')}>
                                {selectedLog.tokens_in || 0} / {selectedLog.tokens_out || 0}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.promptHash')}>
                                <code className="text-xs break-all">{selectedLog.prompt_hash || '-'}</code>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('aiAudit.drawer.outputHash')}>
                                <code className="text-xs break-all">{selectedLog.output_hash || '-'}</code>
                            </Descriptions.Item>
                            {selectedLog.prompt_preview && (
                                <Descriptions.Item label={t('aiAudit.drawer.promptPreview')}>
                                    {/* eslint-disable-next-line admin-ui/no-admin-page-visual-utilities -- prompt preview must preserve raw multiline content formatting */}
                                    <pre className="text-xs bg-slate-50 p-2 rounded whitespace-pre-wrap">
                                        {selectedLog.prompt_preview}
                                    </pre>
                                </Descriptions.Item>
                            )}
                            {selectedLog.error_reason && (
                                <Descriptions.Item label={t('aiAudit.drawer.errorReason')}>
                                    <span className="text-red-500">{selectedLog.error_reason}</span>
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                    </div>
                )}
            </AppDrawer>
        </div>
    );
};

export default AIAudit;
