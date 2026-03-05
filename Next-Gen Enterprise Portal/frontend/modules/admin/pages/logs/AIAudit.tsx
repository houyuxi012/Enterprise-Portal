import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, DatePicker, Select, Space, Drawer, Descriptions, Statistic, Card, Row, Col, Tooltip } from 'antd';
import { ReloadOutlined, InfoCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, StopOutlined, ClockCircleOutlined, RobotOutlined, DatabaseOutlined, CloudOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient, { type AIAuditQueryParams } from '@/services/api';
import dayjs from 'dayjs';

interface AIAuditLog {
    id: number;
    event_id: string;
    ts: string;
    actor_type: string;
    actor_id?: number;
    actor_ip?: string;
    action: string;
    provider?: string;
    model?: string;
    input_policy_result?: string;
    output_policy_result?: string;
    policy_hits?: string;
    latency_ms?: number;
    tokens_in?: number;
    tokens_out?: number;
    status: string;
    error_code?: string;
    error_reason?: string;
    prompt_hash?: string;
    output_hash?: string;
    prompt_preview?: string;
    source?: string;
}

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

const AIAudit: React.FC = () => {
    const { t } = useTranslation();
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
        }
    };

    useEffect(() => {
        fetchLogs();
        fetchStats();
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
            render: (ts: string) => <span className="text-xs text-slate-500">{dayjs(ts).format('YYYY-MM-DD HH:mm:ss')}</span>
        },
        {
            title: t('aiAudit.table.user'),
            dataIndex: 'actor_id',
            key: 'actor_id',
            width: 100,
            render: (id: number, record: AIAuditLog) => (
                <span className="font-medium text-slate-700">
                    {id ? `#${id}` : record.actor_type}
                </span>
            )
        },
        {
            title: t('aiAudit.table.model'),
            key: 'model',
            width: 180,
            render: (_: unknown, record: AIAuditLog) => (
                <div className="flex items-center gap-2">
                    <RobotOutlined className="text-blue-500" />
                    <span className="font-mono text-xs">{record.provider || '-'}</span>
                    <span className="text-slate-400">/</span>
                    <span className="font-mono text-xs text-slate-600">{record.model?.split('-').pop() || '-'}</span>
                </div>
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
                <span className={`font-mono text-xs ${ms > 3000 ? 'text-orange-500' : 'text-slate-500'}`}>
                    {ms ? `${ms}ms` : '-'}
                </span>
            )
        },
        {
            title: 'Token',
            key: 'tokens',
            width: 100,
            render: (_: unknown, record: AIAuditLog) => (
                <span className="font-mono text-xs text-slate-500">
                    {record.tokens_in || 0} / {record.tokens_out || 0}
                </span>
            )
        },
        {
            title: t('aiAudit.table.source'),
            dataIndex: 'source',
            key: 'source',
            width: 100,
            render: (source: string) => {
                const s = source?.toUpperCase() || 'DB';
                // Handle combined source like 'db,loki'
                if (s.includes(',')) {
                    const sources = s.split(',');
                    return (
                        <span className="flex gap-1">
                            {sources.map((src, i) => (
                                <Tag key={i} color={src.trim() === 'LOKI' ? 'purple' : 'cyan'} className="text-xs">
                                    {src.trim()}
                                </Tag>
                            ))}
                        </span>
                    );
                }
                return (
                    <Tag color={s === 'LOKI' ? 'purple' : 'cyan'} className="text-xs">
                        {s}
                    </Tag>
                );
            }
        },
        {
            title: t('aiAudit.table.actions'),
            key: 'action',
            width: 80,
            render: (_: unknown, record: AIAuditLog) => (
                <Button type="link" size="small" onClick={() => handleViewDetail(record)}>
                    {t('common.buttons.detail')}
                </Button>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t('aiAudit.page.title')}</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">{t('aiAudit.page.subtitle')}</p>
                </div>
                <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading} className="rounded-xl">
                    {t('common.buttons.refresh')}
                </Button>
            </div>

            {/* Stats Cards - AI Specific */}
            {stats && (
                <Row gutter={16} className="mb-4">
                    <Col span={6}>
                        <Card className="rounded-2xl shadow-sm">
                            <Statistic
                                title={t('aiAudit.stats.totalRequests7d')}
                                value={stats.total_requests}
                                prefix={<RobotOutlined />}
                                valueStyle={{ color: '#1890ff' }}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card className="rounded-2xl shadow-sm">
                            <Statistic
                                title={t('aiAudit.stats.successRate')}
                                value={stats.success_rate}
                                suffix="%"
                                valueStyle={{ color: stats.success_rate > 90 ? '#52c41a' : '#faad14' }}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card className="rounded-2xl shadow-sm">
                            <Statistic
                                title={t('aiAudit.stats.blockedCount')}
                                value={stats.blocked_count}
                                prefix={<StopOutlined />}
                                valueStyle={{ color: stats.blocked_count > 0 ? '#ff7a45' : '#52c41a' }}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card className="rounded-2xl shadow-sm">
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
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 flex flex-wrap gap-4 items-center">
                <DatePicker.RangePicker
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
                    className="rounded-xl"
                    placeholder={[t('aiAudit.filters.startTime'), t('aiAudit.filters.endTime')]}
                />
                <Select
                    placeholder={t('aiAudit.filters.status')}
                    allowClear
                    value={statusFilter}
                    onChange={setStatusFilter}
                    className="w-32"
                    options={[
                        { value: 'SUCCESS', label: t('aiAudit.status.SUCCESS') },
                        { value: 'BLOCKED', label: t('aiAudit.status.BLOCKED') },
                        { value: 'ERROR', label: t('aiAudit.status.ERROR') },
                    ]}
                />
                <Select
                    placeholder={t('aiAudit.filters.provider')}
                    allowClear
                    value={providerFilter}
                    onChange={setProviderFilter}
                    className="w-32"
                    options={[
                        { value: 'gemini', label: 'Gemini' },
                        { value: 'openai', label: 'OpenAI' },
                        { value: 'deepseek', label: 'DeepSeek' },
                        { value: 'qwen', label: 'Qwen' },
                    ]}
                />
                <Select
                    value={sourceFilter}
                    onChange={setSourceFilter}
                    className="w-28"
                    options={[
                        { value: 'db', label: <span className="flex items-center gap-1"><DatabaseOutlined />DB</span> },
                        { value: 'loki', label: <span className="flex items-center gap-1"><CloudOutlined />Loki</span> },
                        { value: 'all', label: t('common.status.all') },
                    ]}
                />
                <Button type="primary" onClick={fetchLogs} loading={loading} className="rounded-xl">
                    {t('common.buttons.query')}
                </Button>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <Table
                    dataSource={logs}
                    columns={columns}
                    rowKey="event_id"
                    loading={loading}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    scroll={{ x: 1200 }}
                    locale={{ emptyText: t('aiAudit.table.empty') }}
                    className="ant-table-custom"
                />
            </div>

            {/* Detail Drawer */}
            <Drawer
                title={t('aiAudit.drawer.title')}
                width={600}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
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
            </Drawer>
        </div>
    );
};

export default AIAudit;
