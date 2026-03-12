import React, { useEffect, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Descriptions from 'antd/es/descriptions';
import Row from 'antd/es/grid/row';
import Tag from 'antd/es/tag';
import Tooltip from 'antd/es/tooltip';
import Typography from 'antd/es/typography';
import {
    ReloadOutlined,
    ClockCircleOutlined,
    EyeOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient, { type AccessLogEntry } from '@/services/api';
import dayjs from 'dayjs';
import { AppButton, AppDrawer, AppFilterBar, AppPageHeader, AppTable } from '@/modules/admin/components/ui';

const { Text, Title } = Typography;

type AccessLog = AccessLogEntry & {
    id: number;
    timestamp: string;
    trace_id?: string;
    method: string;
    path: string;
    status_code: number;
    ip_address?: string;
    user_agent?: string;
    latency_ms?: number;
};

interface Stats {
    total: number;
    successRate: number;
    avgLatency: number;
    errorCount: number;
}

const AccessLogs: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [logs, setLogs] = useState<AccessLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<Stats>({ total: 0, successRate: 0, avgLatency: 0, errorCount: 0 });

    // Filters
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
    const [filterPath, setFilterPath] = useState<string>('');
    const [methodFilter, setMethodFilter] = useState<string | undefined>();
    const [statusFilter, setStatusFilter] = useState<string | undefined>();

    // Detail drawer
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<AccessLog | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const response = await ApiClient.getAccessLogs({
                path: filterPath || undefined
            });
            let filtered = response;

            // Apply method filter
            if (methodFilter) {
                filtered = filtered.filter((log: AccessLog) => log.method === methodFilter);
            }

            // Apply status filter
            if (statusFilter) {
                if (statusFilter === 'success') {
                    filtered = filtered.filter((log: AccessLog) => log.status_code < 400);
                } else if (statusFilter === 'error') {
                    filtered = filtered.filter((log: AccessLog) => log.status_code >= 400);
                }
            }

            // Apply date range filter
            if (dateRange[0] && dateRange[1]) {
                const start = dateRange[0].startOf('day');
                const end = dateRange[1].endOf('day');
                filtered = filtered.filter((log: AccessLog) => {
                    const logDate = dayjs(log.timestamp);
                    return logDate.isAfter(start) && logDate.isBefore(end);
                });
            }

            setLogs(filtered);

            // Calculate stats
            const total = filtered.length;
            const successCount = filtered.filter((log: AccessLog) => log.status_code < 400).length;
            const errorCount = filtered.filter((log: AccessLog) => log.status_code >= 400).length;
            const avgLatency = total > 0
                ? Math.round(filtered.reduce((sum: number, log: AccessLog) => sum + (log.latency_ms || 0), 0) / total)
                : 0;

            setStats({
                total,
                successRate: total > 0 ? Math.round((successCount / total) * 100 * 10) / 10 : 0,
                avgLatency,
                errorCount
            });
        } catch (error) {
            console.error(error);
            message.error(t('accessLogs.messages.loadFailed', '加载访问日志失败'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchLogs();
    }, []);

    const showDetail = (record: AccessLog) => {
        setSelectedLog(record);
        setDrawerOpen(true);
    };

    const methodOptions = [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
        { value: 'DELETE', label: 'DELETE' },
        { value: 'PATCH', label: 'PATCH' },
    ];

    const columns = [
        {
            title: t('accessLogs.table.time'),
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 160,
            render: (text: string) => {
                const formatted = text ? text.replace('T', ' ').substring(0, 19) : text;
                return <Text type="secondary">{formatted || '-'}</Text>;
            }
        },
        {
            title: t('accessLogs.table.method'),
            dataIndex: 'method',
            key: 'method',
            width: 80,
            render: (method: string) => {
                const colorMap: Record<string, string> = {
                    'GET': 'green',
                    'POST': 'blue',
                    'PUT': 'orange',
                    'DELETE': 'red',
                    'PATCH': 'purple'
                };
                return <Tag color={colorMap[method] || 'default'} className="font-bold">{method}</Tag>;
            }
        },
        {
            title: t('accessLogs.table.path'),
            dataIndex: 'path',
            key: 'path',
            width: 280,
            ellipsis: true,
            render: (text: string) => (
                <Tooltip title={text}>
                    <Text
                        ellipsis={{ tooltip: text }}
                        style={{ display: 'block', maxWidth: 260 }}
                    >
                        {text || '-'}
                    </Text>
                </Tooltip>
            )
        },
        {
            title: t('accessLogs.table.statusCode'),
            dataIndex: 'status_code',
            key: 'status_code',
            width: 90,
            render: (code: number) => {
                const color = code < 300 ? 'green' : (code < 400 ? 'blue' : (code < 500 ? 'orange' : 'red'));
                return <Tag color={color} className="font-bold">{code}</Tag>;
            }
        },
        {
            title: t('accessLogs.table.ip'),
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 120,
            render: (text: string) => (
                text ? (
                    <Text
                        type="secondary"
                        ellipsis={{ tooltip: text }}
                        className="!inline-block max-w-[124px] align-middle"
                    >
                        {text}
                    </Text>
                ) : (
                    <Text type="secondary">-</Text>
                )
            )
        },
        {
            title: t('accessLogs.table.latency'),
            dataIndex: 'latency_ms',
            key: 'latency_ms',
            width: 90,
            render: (ms: number) => {
                const color = ms < 100 ? 'green' : (ms < 500 ? 'orange' : 'red');
                return <Tag color={color} className="font-mono">{ms}ms</Tag>;
            }
        },
        {
            title: t('accessLogs.table.traceId'),
            dataIndex: 'trace_id',
            key: 'trace_id',
            width: 120,
            render: (text: string) => (
                <Tooltip title={text}>
                    <Text
                        type="secondary"
                        style={{ fontSize: 12, letterSpacing: '0.08em' }}
                    >
                        {text ? `${text.substring(0, 8)}...` : '-'}
                    </Text>
                </Tooltip>
            )
        },
        {
            title: t('accessLogs.table.actions'),
            key: 'actions',
            width: 80,
            render: (_: unknown, record: AccessLog) => (
                <AppButton
                    intent="tertiary"
                    size="sm"
                    icon={<EyeOutlined />}
                    onClick={() => showDetail(record)}
                >
                    {t('common.buttons.detail')}
                </AppButton>
            )
        }
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('accessLogs.page.title')}
                subtitle={t('accessLogs.page.subtitle')}
                action={(
                    <AppButton
                        intent="secondary"
                        icon={<ReloadOutlined />}
                        onClick={fetchLogs}
                        loading={loading}
                    >
                        {t('common.buttons.refresh')}
                    </AppButton>
                )}
            />

            <Row gutter={[16, 16]} className="mb-4">
                <Col span={6}>
                    <Card className="admin-card" bodyStyle={{ padding: 18 }}>
                        <div className="space-y-2">
                            <Text type="secondary">{t('accessLogs.stats.totalRequests')}</Text>
                            <Title level={3} className="!m-0 !leading-none">
                                {stats.total}
                            </Title>
                        </div>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="admin-card" bodyStyle={{ padding: 18 }}>
                        <div className="space-y-2">
                            <Text type="secondary">{t('accessLogs.stats.successRate')}</Text>
                            <div className="text-[28px] font-semibold leading-none text-emerald-600">{stats.successRate}%</div>
                        </div>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="admin-card" bodyStyle={{ padding: 18 }}>
                        <div className="space-y-2">
                            <Text type="secondary">{t('accessLogs.stats.avgLatency')}</Text>
                            <div className="text-[28px] font-semibold leading-none text-amber-600">{stats.avgLatency}ms</div>
                        </div>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="admin-card" bodyStyle={{ padding: 18 }}>
                        <div className="space-y-2">
                            <Text type="secondary">{t('accessLogs.stats.errorRequests')}</Text>
                            <div className="text-[28px] font-semibold leading-none text-rose-600">{stats.errorCount}</div>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Filters */}
            <AppFilterBar>
                <AppFilterBar.DateRange
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
                    placeholder={[t('accessLogs.filters.startTime'), t('accessLogs.filters.endTime')]}
                />
                <AppFilterBar.Search
                    placeholder={t('accessLogs.filters.path')}
                    value={filterPath}
                    className="!w-52"
                    onChange={(e) => setFilterPath(e.target.value)}
                    onPressEnter={() => {
                        void fetchLogs();
                    }}
                />
                <AppFilterBar.Select
                    placeholder={t('accessLogs.filters.method')}
                    value={methodFilter}
                    onChange={setMethodFilter}
                    width={128}
                    options={methodOptions}
                />
                <AppFilterBar.Select
                    placeholder={t('accessLogs.filters.status')}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    width={144}
                    options={[
                        { value: 'success', label: t('accessLogs.filters.statusSuccess') },
                        { value: 'error', label: t('accessLogs.filters.statusError') }
                    ]}
                />
                <AppFilterBar.Action>
                    <AppButton
                        intent="primary"
                        onClick={() => { void fetchLogs(); }}
                        loading={loading}
                    >
                        {t('common.buttons.query')}
                    </AppButton>
                </AppFilterBar.Action>
            </AppFilterBar>

            <Card className="admin-card">
                <AppTable<AccessLog>
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    scroll={{ x: 1100 }}
                    locale={{ emptyText: t('accessLogs.table.empty') }}
                    size="small"
                />
            </Card>

            <AppDrawer
                title={<Title level={5} className="!m-0">{t('accessLogs.drawer.title')}</Title>}
                width={560}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                hideFooter
            >
                {selectedLog && (
                    <div className="space-y-4">
                        <Descriptions column={1} size="middle" colon={false}>
                            <Descriptions.Item label={t('accessLogs.drawer.time')}>
                                <Text type="secondary">{selectedLog.timestamp?.replace('T', ' ').substring(0, 19) || '-'}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.method')}>
                                <Text strong>{selectedLog.method || '-'}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.path')}>
                                <Text style={{ wordBreak: 'break-all' }}>{selectedLog.path || '-'}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.statusCode')}>
                                {(() => {
                                    const code = selectedLog.status_code;
                                    const color = code < 300 ? '#16a34a' : (code < 400 ? '#2563eb' : (code < 500 ? '#d97706' : '#dc2626'));
                                    return <Text strong style={{ color }}>{code}</Text>;
                                })()}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.responseTime')}>
                                <Text type="secondary">{selectedLog.latency_ms != null ? `${selectedLog.latency_ms} ms` : '-'}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.ip')}>
                                <Text type="secondary">{selectedLog.ip_address || '-'}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.traceId')}>
                                <Text type="secondary" className="break-all text-xs">
                                    {selectedLog.trace_id || '-'}
                                </Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.userAgent')}>
                                <Text type="secondary" className="break-all text-xs">
                                    {selectedLog.user_agent || '-'}
                                </Text>
                            </Descriptions.Item>
                        </Descriptions>
                    </div>
                )}
            </AppDrawer>
        </div>
    );
};

export default AccessLogs;
