import React, { useEffect, useState } from 'react';
import { Table, Tag, Select, Button, Drawer, Descriptions, Statistic, Card, Row, Col, DatePicker, Tooltip, Input } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, UserOutlined, SafetyCertificateOutlined, KeyOutlined, DatabaseOutlined, CloudOutlined } from '@ant-design/icons';
import ApiClient from '@/services/api';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

interface AuditLog {
    id: number;
    timestamp: string;
    user_id?: number;
    username?: string;
    action: string;
    target_type: string;
    target_id?: number;
    target_name?: string;
    detail?: any;
    ip_address?: string;
    user_agent?: string;
    result?: string;
    reason?: string;
    trace_id?: string;
    source?: string;
}

interface LogStats {
    loginCount: number;
    todayLogins: number;
    failedAttempts: number;
    activeUsers: number;
}

const ACTION_CATEGORY_COLORS: Record<string, string> = {
    login: 'cyan',
    logout: 'orange',
    create: 'green',
    update: 'blue',
    delete: 'red',
    assign: 'purple',
    revoke: 'magenta',
    other: 'default',
};

const normalizeActionKey = (action: string) => String(action || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

const getActionCategoryKey = (action: string): string => {
    if (action.includes('login')) return 'login';
    if (action.includes('logout')) return 'logout';
    if (action.includes('create')) return 'create';
    if (action.includes('update')) return 'update';
    if (action.includes('delete')) return 'delete';
    if (action.includes('assign')) return 'assign';
    if (action.includes('revoke')) return 'revoke';
    return 'other';
};

const AuditLogs: React.FC = () => {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<LogStats>({ loginCount: 0, todayLogins: 0, failedAttempts: 0, activeUsers: 0 });
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
    const [actionFilter, setActionFilter] = useState<string | undefined>();
    const [resultFilter, setResultFilter] = useState<string | undefined>();
    const [usernameFilter, setUsernameFilter] = useState<string>('');
    const [sourceFilter, setSourceFilter] = useState<string>('all');

    const getActionLabel = (action: string) => t(`iamAudit.actions.${normalizeActionKey(action)}`, { defaultValue: action });

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params: any = {
                page,
                page_size: pageSize,
                source: sourceFilter,
            };
            if (usernameFilter) params.username = usernameFilter;
            if (actionFilter) params.action = actionFilter;
            if (resultFilter) params.result = resultFilter;
            if (dateRange[0] && dateRange[1]) {
                params.start_time = dateRange[0].toISOString();
                params.end_time = dateRange[1].toISOString();
            }

            const res = await ApiClient.getIamAuditLogs(params);
            const data = res.items || [];
            setLogs(data);
            setTotal(res.total || 0);

            const today = dayjs().format('YYYY-MM-DD');
            const allLogs = data as AuditLog[];
            const loginLogs = allLogs.filter((log) => log.action?.includes('login'));
            const todayLoginLogs = loginLogs.filter((log) => log.timestamp?.startsWith(today));
            const failedLogs = allLogs.filter((log) => log.result === 'fail' || log.result === 'failure');
            const uniqueUsers = new Set(allLogs.map((log) => log.username).filter(Boolean));

            setStats({
                loginCount: loginLogs.length,
                todayLogins: todayLoginLogs.length,
                failedAttempts: failedLogs.length,
                activeUsers: uniqueUsers.size,
            });
        } catch (error) {
            console.error('Failed to fetch audit logs', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [page, pageSize]);

    const handleViewDetail = (record: AuditLog) => {
        setSelectedLog(record);
        setDrawerOpen(true);
    };

    const extractClientContext = (log?: AuditLog | null): { deviceType?: string; os?: string; browser?: string } => {
        if (!log) return {};
        const detail = log.detail;
        if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
            const d = detail as Record<string, any>;
            const client = d.client_context && typeof d.client_context === 'object' ? d.client_context : d;
            return {
                deviceType: client.device_type || client.deviceType,
                os: client.os || client.os_name,
                browser: client.browser || client.browser_name,
            };
        }
        return {};
    };

    const columns = [
        {
            title: t('iamAudit.table.time'),
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (text: string) => (
                <span className="text-xs text-slate-500">{text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'}</span>
            ),
        },
        {
            title: t('iamAudit.table.operator'),
            dataIndex: 'username',
            key: 'username',
            width: 120,
            render: (text: string) => (
                <div className="flex items-center gap-2">
                    <UserOutlined className="text-indigo-500" />
                    <span className="font-medium text-slate-700">{text || '-'}</span>
                </div>
            ),
        },
        {
            title: t('iamAudit.table.action'),
            dataIndex: 'action',
            key: 'action',
            width: 180,
            render: (text: string) => {
                const categoryKey = getActionCategoryKey(text);
                const color = ACTION_CATEGORY_COLORS[categoryKey] || ACTION_CATEGORY_COLORS.other;
                return (
                    <Tooltip title={text}>
                        <Tag color={color} icon={<SafetyCertificateOutlined />}>
                            {getActionLabel(text)}
                        </Tag>
                    </Tooltip>
                );
            },
        },
        {
            title: t('iamAudit.table.resourceType'),
            dataIndex: 'target_type',
            key: 'target_type',
            width: 120,
            render: (text: string) => (
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600">{text || '-'}</span>
            ),
        },
        {
            title: t('iamAudit.table.target'),
            dataIndex: 'target_name',
            key: 'target_name',
            width: 120,
            render: (text: string) => <span className="font-mono text-xs text-slate-600">{text || '-'}</span>,
        },
        {
            title: t('iamAudit.table.ip'),
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 140,
            render: (text: string) => <span className="font-mono text-xs text-slate-400">{text || '-'}</span>,
        },
        {
            title: t('iamAudit.table.result'),
            dataIndex: 'result',
            key: 'result',
            width: 100,
            render: (result: string) => (
                <Tag color={result === 'success' ? 'green' : 'red'} icon={result === 'success' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
                    {result === 'success' ? t('common.status.success') : t('common.status.fail')}
                </Tag>
            ),
        },
        {
            title: t('iamAudit.table.source'),
            dataIndex: 'source',
            key: 'source',
            width: 100,
            render: (source: string) => <Tag color={source === 'DB' ? 'blue' : 'purple'}>{source || t('iamAudit.source.db')}</Tag>,
        },
        {
            title: t('iamAudit.table.operation'),
            key: 'actions',
            width: 80,
            render: (_: any, record: AuditLog) => (
                <Button type="link" size="small" onClick={() => handleViewDetail(record)}>
                    {t('common.buttons.detail')}
                </Button>
            ),
        },
    ];

    const actionOptions = [...new Set(logs.map((log) => log.action))].map((action) => ({
        value: action,
        label: getActionLabel(action),
    }));

    const selectedClientContext = extractClientContext(selectedLog);

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t('iamAudit.title')}</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">{t('iamAudit.subtitle')}</p>
                </div>
                <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading} className="rounded-xl">
                    {t('common.buttons.refresh')}
                </Button>
            </div>

            <Row gutter={16} className="mb-4">
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic title={t('iamAudit.stats.loginCount')} value={stats.loginCount} prefix={<KeyOutlined />} valueStyle={{ color: '#1890ff' }} />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic title={t('iamAudit.stats.todayLogins')} value={stats.todayLogins} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic title={t('iamAudit.stats.failedAttempts')} value={stats.failedAttempts} prefix={<CloseCircleOutlined />} valueStyle={{ color: stats.failedAttempts > 0 ? '#ff4d4f' : '#52c41a' }} />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic title={t('iamAudit.stats.activeUsers')} value={stats.activeUsers} prefix={<UserOutlined />} valueStyle={{ color: '#722ed1' }} />
                    </Card>
                </Col>
            </Row>

            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 flex flex-wrap gap-4 items-center">
                <DatePicker.RangePicker
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
                    className="rounded-xl"
                    placeholder={[t('iamAudit.filters.startTime'), t('iamAudit.filters.endTime')]}
                    showTime
                />
                <Input
                    placeholder={t('common.placeholders.username')}
                    value={usernameFilter}
                    onChange={(e) => setUsernameFilter(e.target.value)}
                    onPressEnter={() => fetchLogs()}
                    className="w-32 rounded-xl"
                    allowClear
                />
                <Select placeholder={t('iamAudit.filters.actionType')} allowClear value={actionFilter} onChange={setActionFilter} className="w-40" options={actionOptions} />
                <Select
                    placeholder={t('iamAudit.filters.result')}
                    allowClear
                    value={resultFilter}
                    onChange={setResultFilter}
                    className="w-28"
                    options={[
                        { value: 'success', label: t('common.status.success') },
                        { value: 'fail', label: t('common.status.fail') },
                    ]}
                />
                <Select
                    value={sourceFilter}
                    onChange={setSourceFilter}
                    className="w-28"
                    options={[
                        { value: 'db', label: <span className="flex items-center gap-1"><DatabaseOutlined />{t('iamAudit.source.db')}</span> },
                        { value: 'loki', label: <span className="flex items-center gap-1"><CloudOutlined />{t('iamAudit.source.loki')}</span> },
                        { value: 'all', label: t('iamAudit.source.all') },
                    ]}
                />
                <Button type="primary" onClick={fetchLogs} loading={loading} className="rounded-xl">
                    {t('common.buttons.query')}
                </Button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <Table
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        current: page,
                        pageSize: pageSize,
                        total: total,
                        onChange: (p, ps) => {
                            setPage(p);
                            setPageSize(ps);
                        },
                        showSizeChanger: true,
                    }}
                    scroll={{ x: 1100 }}
                    locale={{ emptyText: t('iamAudit.table.empty') }}
                    className="ant-table-custom"
                />
            </div>

            <Drawer title={t('iamAudit.drawer.title')} width={560} open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                {selectedLog && (
                    <div className="space-y-6">
                        <Descriptions bordered column={1} size="small">
                            <Descriptions.Item label={t('iamAudit.drawer.logId')}>
                                <code className="text-xs">{selectedLog.id}</code>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.traceId')}>
                                <code className="text-xs">{selectedLog.trace_id || '-'}</code>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.time')}>
                                {selectedLog.timestamp ? dayjs(selectedLog.timestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.operator')}>
                                {selectedLog.username || '-'} {selectedLog.user_id ? `(ID: ${selectedLog.user_id})` : ''}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.action')}>
                                <Tag color="blue">{getActionLabel(selectedLog.action)}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.resource')}>
                                <code className="text-xs">{selectedLog.target_type}</code>
                                {selectedLog.target_id && ` : ${selectedLog.target_id}`}
                                {selectedLog.target_name && ` (${selectedLog.target_name})`}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.ip')}>{selectedLog.ip_address || '-'}</Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.deviceType')}>{selectedClientContext.deviceType || '-'}</Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.os')}>{selectedClientContext.os || '-'}</Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.browser')}>{selectedClientContext.browser || '-'}</Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.userAgent')}>
                                <span className="text-xs break-all">{selectedLog.user_agent || '-'}</span>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('iamAudit.drawer.result')}>
                                <Tag color={selectedLog.result === 'success' ? 'green' : 'red'}>
                                    {selectedLog.result === 'success' ? t('common.status.success') : t('common.status.fail')}
                                </Tag>
                                {selectedLog.reason && <span className="text-red-500 ml-2">{selectedLog.reason}</span>}
                            </Descriptions.Item>
                        </Descriptions>
                    </div>
                )}
            </Drawer>
        </div>
    );
};

export default AuditLogs;
