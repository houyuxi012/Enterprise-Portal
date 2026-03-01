import React, { useEffect, useState } from 'react';
import { Table, Tag, Input, Button, Card, Row, Col, Statistic, Select, DatePicker, Drawer, Descriptions, Tooltip } from 'antd';
import {
    SearchOutlined, ReloadOutlined, CloudOutlined, ApiOutlined,
    ClockCircleOutlined, CheckCircleOutlined, WarningOutlined,
    EyeOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '../../../services/api';
import dayjs from 'dayjs';

interface AccessLog {
    id: number;
    timestamp: string;
    trace_id: string;
    method: string;
    path: string;
    status_code: number;
    ip_address: string;
    user_agent: string;
    latency_ms: number;
}

interface Stats {
    total: number;
    successRate: number;
    avgLatency: number;
    errorCount: number;
}

const AccessLogs: React.FC = () => {
    const { t } = useTranslation();
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
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
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
                return <span className="font-mono text-xs text-slate-500">{formatted}</span>;
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
                    <span className="font-mono text-xs text-slate-600">{text}</span>
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
            render: (text: string) => <span className="font-mono text-xs text-slate-400">{text || '-'}</span>
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
                    <span className="font-mono text-xs text-slate-400">{text?.substring(0, 8)}...</span>
                </Tooltip>
            )
        },
        {
            title: t('accessLogs.table.actions'),
            key: 'actions',
            width: 80,
            render: (_: unknown, record: AccessLog) => (
                <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => showDetail(record)}
                    className="text-indigo-500 font-bold"
                >
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
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <CloudOutlined className="text-indigo-500" />
                        {t('accessLogs.page.title')}
                    </h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">{t('accessLogs.page.subtitle')}</p>
                </div>
                <Button
                    icon={<ReloadOutlined />}
                    onClick={fetchLogs}
                    loading={loading}
                    className="rounded-xl px-4 border-slate-200 shadow-sm font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200"
                >
                    {t('common.buttons.refresh')}
                </Button>
            </div>

            {/* Stats Cards */}
            <Row gutter={16} className="mb-4">
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm border-slate-100 dark:border-slate-700/50 hover:shadow-md transition-shadow">
                        <Statistic
                            title={<span className="text-slate-500 font-bold">{t('accessLogs.stats.totalRequests')}</span>}
                            value={stats.total}
                            prefix={<ApiOutlined className="text-indigo-500" />}
                            valueStyle={{ color: '#6366f1', fontWeight: 800 }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm border-slate-100 dark:border-slate-700/50 hover:shadow-md transition-shadow">
                        <Statistic
                            title={<span className="text-slate-500 font-bold">{t('accessLogs.stats.successRate')}</span>}
                            value={stats.successRate}
                            suffix="%"
                            prefix={<CheckCircleOutlined className="text-green-500" />}
                            valueStyle={{ color: '#22c55e', fontWeight: 800 }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm border-slate-100 dark:border-slate-700/50 hover:shadow-md transition-shadow">
                        <Statistic
                            title={<span className="text-slate-500 font-bold">{t('accessLogs.stats.avgLatency')}</span>}
                            value={stats.avgLatency}
                            suffix="ms"
                            prefix={<ThunderboltOutlined className="text-amber-500" />}
                            valueStyle={{ color: '#f59e0b', fontWeight: 800 }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm border-slate-100 dark:border-slate-700/50 hover:shadow-md transition-shadow">
                        <Statistic
                            title={<span className="text-slate-500 font-bold">{t('accessLogs.stats.errorRequests')}</span>}
                            value={stats.errorCount}
                            prefix={<WarningOutlined className="text-red-500" />}
                            valueStyle={{ color: '#ef4444', fontWeight: 800 }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 flex flex-wrap gap-4 items-center">
                <DatePicker.RangePicker
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
                    className="rounded-xl"
                    placeholder={[t('accessLogs.filters.startTime'), t('accessLogs.filters.endTime')]}
                />
                <Input
                    placeholder={t('accessLogs.filters.path')}
                    style={{ width: 200 }}
                    value={filterPath}
                    onChange={e => setFilterPath(e.target.value)}
                    onPressEnter={fetchLogs}
                    prefix={<SearchOutlined className="text-slate-400" />}
                    className="rounded-xl"
                />
                <Select
                    placeholder={t('accessLogs.filters.method')}
                    allowClear
                    value={methodFilter}
                    onChange={setMethodFilter}
                    className="w-32"
                    options={methodOptions}
                />
                <Select
                    placeholder={t('accessLogs.filters.status')}
                    allowClear
                    value={statusFilter}
                    onChange={setStatusFilter}
                    className="w-32"
                    options={[
                        { value: 'success', label: t('accessLogs.filters.statusSuccess') },
                        { value: 'error', label: t('accessLogs.filters.statusError') }
                    ]}
                />
                <Button
                    type="primary"
                    onClick={fetchLogs}
                    loading={loading}
                    className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700"
                >
                    {t('common.buttons.query')}
                </Button>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <Table
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    scroll={{ x: 1100 }}
                    locale={{ emptyText: t('accessLogs.table.empty') }}
                    className="ant-table-custom"
                    size="small"
                />
            </div>

            {/* Detail Drawer */}
            <Drawer
                title={
                    <span className="font-bold text-lg flex items-center gap-2">
                        <CloudOutlined className="text-indigo-500" />
                        {t('accessLogs.drawer.title')}
                    </span>
                }
                width={560}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
            >
                {selectedLog && (
                    <div className="space-y-6">
                        <Descriptions bordered column={1} size="small">
                            <Descriptions.Item label={t('accessLogs.drawer.time')}>
                                <span className="font-mono">{selectedLog.timestamp?.replace('T', ' ').substring(0, 19)}</span>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.method')}>
                                {(() => {
                                    const colorMap: Record<string, string> = {
                                        'GET': 'green',
                                        'POST': 'blue',
                                        'PUT': 'orange',
                                        'DELETE': 'red',
                                        'PATCH': 'purple'
                                    };
                                    return <Tag color={colorMap[selectedLog.method] || 'default'}>{selectedLog.method}</Tag>;
                                })()}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.path')}>
                                <span className="font-mono text-sm break-all">{selectedLog.path}</span>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.statusCode')}>
                                {(() => {
                                    const code = selectedLog.status_code;
                                    const color = code < 300 ? 'green' : (code < 400 ? 'blue' : (code < 500 ? 'orange' : 'red'));
                                    return <Tag color={color}>{code}</Tag>;
                                })()}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.responseTime')}>
                                {(() => {
                                    const ms = selectedLog.latency_ms;
                                    const color = ms < 100 ? 'green' : (ms < 500 ? 'orange' : 'red');
                                    return <Tag color={color}>{ms} ms</Tag>;
                                })()}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.ip')}>
                                <span className="font-mono">{selectedLog.ip_address || '-'}</span>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.traceId')}>
                                <span className="font-mono text-xs break-all">{selectedLog.trace_id}</span>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('accessLogs.drawer.userAgent')}>
                                <span className="text-xs break-all">{selectedLog.user_agent || '-'}</span>
                            </Descriptions.Item>
                        </Descriptions>
                    </div>
                )}
            </Drawer>
        </div>
    );
};

export default AccessLogs;
