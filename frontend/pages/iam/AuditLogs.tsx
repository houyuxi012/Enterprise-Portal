import React, { useEffect, useState } from 'react';
import { Table, Tag, Select, Button, Drawer, Descriptions, Statistic, Card, Row, Col, DatePicker, Tooltip, Input } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, UserOutlined, SafetyCertificateOutlined, KeyOutlined, DatabaseOutlined, CloudOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import dayjs from 'dayjs';

const ACTION_MAP: Record<string, string> = {
    'iam.login.success': '登录成功',
    'iam.login.fail': '登录失败',
    'iam.logout': '用户登出',
    'iam.role.create': '创建角色',
    'iam.role.update': '更新角色',
    'iam.role.delete': '删除角色',
    'iam.user.update': '更新用户',
    'iam.user.create': '创建用户',
    'iam.user.delete': '删除用户',
    'iam.permission.assign': '分配权限',
    'iam.permission.revoke': '撤销权限',
};

const ACTION_CATEGORIES: Record<string, { label: string; color: string }> = {
    'login': { label: '登录', color: 'cyan' },
    'logout': { label: '登出', color: 'orange' },
    'create': { label: '创建', color: 'green' },
    'update': { label: '更新', color: 'blue' },
    'delete': { label: '删除', color: 'red' },
    'assign': { label: '分配', color: 'purple' },
    'revoke': { label: '撤销', color: 'magenta' },
    'other': { label: '其他', color: 'default' }
};

const getActionCategory = (action: string): { label: string; color: string } => {
    if (action.includes('login')) return ACTION_CATEGORIES['login'];
    if (action.includes('logout')) return ACTION_CATEGORIES['logout'];
    if (action.includes('create')) return ACTION_CATEGORIES['create'];
    if (action.includes('update')) return ACTION_CATEGORIES['update'];
    if (action.includes('delete')) return ACTION_CATEGORIES['delete'];
    if (action.includes('assign')) return ACTION_CATEGORIES['assign'];
    if (action.includes('revoke')) return ACTION_CATEGORIES['revoke'];
    return ACTION_CATEGORIES['other'];
};

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
    result?: string;
    reason?: string;
    trace_id?: string;
}

interface LogStats {
    total: number;
    success: number;
    fail: number;
    todayCount: number;
}

const AuditLogs: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<LogStats>({ total: 0, success: 0, fail: 0, todayCount: 0 });
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    // Filters
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
    const [actionFilter, setActionFilter] = useState<string | undefined>();
    const [resultFilter, setResultFilter] = useState<string | undefined>();
    const [usernameFilter, setUsernameFilter] = useState<string>('');
    const [sourceFilter, setSourceFilter] = useState<string>('db');

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

            // Calculate stats from data
            const today = dayjs().format('YYYY-MM-DD');
            const todayLogs = data.filter((log: AuditLog) => log.timestamp?.startsWith(today));
            setStats({
                total: res.total || data.length,
                success: data.filter((log: AuditLog) => log.result === 'success').length,
                fail: data.filter((log: AuditLog) => log.result === 'fail' || log.result === 'failure').length,
                todayCount: todayLogs.length
            });
        } catch (error) {
            console.error("Failed to fetch audit logs", error);
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

    const columns = [
        {
            title: '时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (text: string) => (
                <span className="text-xs text-slate-500">
                    {text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'}
                </span>
            )
        },
        {
            title: '操作人',
            dataIndex: 'username',
            key: 'username',
            width: 120,
            render: (text: string) => (
                <div className="flex items-center gap-2">
                    <UserOutlined className="text-indigo-500" />
                    <span className="font-medium text-slate-700">{text || '-'}</span>
                </div>
            )
        },
        {
            title: '动作',
            dataIndex: 'action',
            key: 'action',
            width: 160,
            render: (text: string) => {
                const category = getActionCategory(text);
                return (
                    <Tooltip title={text}>
                        <Tag color={category.color} icon={<SafetyCertificateOutlined />}>
                            {ACTION_MAP[text] || text}
                        </Tag>
                    </Tooltip>
                );
            }
        },
        {
            title: '资源类型',
            dataIndex: 'target_type',
            key: 'target_type',
            width: 100,
            render: (text: string) => (
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600">
                    {text || '-'}
                </span>
            )
        },
        {
            title: '目标',
            dataIndex: 'target_name',
            key: 'target_name',
            width: 120,
            render: (text: string) => (
                <span className="font-mono text-xs text-slate-600">{text || '-'}</span>
            )
        },
        {
            title: 'IP 地址',
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 120,
            render: (text: string) => (
                <span className="font-mono text-xs text-slate-400">{text || '-'}</span>
            )
        },
        {
            title: '结果',
            dataIndex: 'result',
            key: 'result',
            width: 90,
            render: (result: string) => (
                <Tag
                    color={result === 'success' ? 'green' : 'red'}
                    icon={result === 'success' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                >
                    {result === 'success' ? '成功' : '失败'}
                </Tag>
            )
        },
        {
            title: '来源',
            dataIndex: 'source',
            key: 'source',
            width: 70,
            render: (source: string) => (
                <Tag color={source === 'DB' ? 'blue' : 'purple'}>
                    {source || 'DB'}
                </Tag>
            )
        },
        {
            title: '操作',
            key: 'actions',
            width: 80,
            render: (_: any, record: AuditLog) => (
                <Button type="link" size="small" onClick={() => handleViewDetail(record)}>
                    详情
                </Button>
            )
        }
    ];

    // Get unique actions for filter
    const actionOptions = [...new Set(logs.map(log => log.action))].map(action => ({
        value: action,
        label: ACTION_MAP[action] || action
    }));

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">IAM 审计</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">审计身份认证与访问控制操作</p>
                </div>
                <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading} className="rounded-xl">
                    刷新
                </Button>
            </div>

            {/* Stats Cards */}
            <Row gutter={16} className="mb-4">
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic title="日志总数" value={stats.total} prefix={<KeyOutlined />} />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic
                            title="成功率"
                            value={stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0}
                            suffix="%"
                            valueStyle={{ color: stats.success / stats.total > 0.9 ? '#52c41a' : '#faad14' }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic
                            title="失败次数"
                            value={stats.fail}
                            prefix={<CloseCircleOutlined />}
                            valueStyle={{ color: stats.fail > 0 ? '#ff4d4f' : '#52c41a' }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic title="今日操作" value={stats.todayCount} prefix={<CheckCircleOutlined />} />
                    </Card>
                </Col>
            </Row>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 flex flex-wrap gap-4 items-center">
                <DatePicker.RangePicker
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
                    className="rounded-xl"
                    placeholder={['开始时间', '结束时间']}
                    showTime
                />
                <Input
                    placeholder="用户名"
                    value={usernameFilter}
                    onChange={e => setUsernameFilter(e.target.value)}
                    onPressEnter={() => fetchLogs()}
                    className="w-32 rounded-xl"
                    allowClear
                />
                <Select
                    placeholder="动作类型"
                    allowClear
                    value={actionFilter}
                    onChange={setActionFilter}
                    className="w-40"
                    options={actionOptions}
                />
                <Select
                    placeholder="结果"
                    allowClear
                    value={resultFilter}
                    onChange={setResultFilter}
                    className="w-28"
                    options={[
                        { value: 'success', label: '成功' },
                        { value: 'fail', label: '失败' },
                    ]}
                />
                <Select
                    value={sourceFilter}
                    onChange={setSourceFilter}
                    className="w-28"
                    options={[
                        { value: 'db', label: <span className="flex items-center gap-1"><DatabaseOutlined />DB</span> },
                        { value: 'loki', label: <span className="flex items-center gap-1"><CloudOutlined />Loki</span> },
                        { value: 'all', label: '全部' },
                    ]}
                />
                <Button type="primary" onClick={fetchLogs} loading={loading} className="rounded-xl">
                    查询
                </Button>
            </div>

            {/* Table */}
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
                        showSizeChanger: true
                    }}
                    scroll={{ x: 1100 }}
                    locale={{ emptyText: '暂无 IAM 审计日志' }}
                    className="ant-table-custom"
                />
            </div>

            {/* Detail Drawer */}
            <Drawer
                title="IAM 审计详情"
                width={560}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
            >
                {selectedLog && (
                    <div className="space-y-6">
                        <Descriptions bordered column={1} size="small">
                            <Descriptions.Item label="日志 ID">
                                <code className="text-xs">{selectedLog.id}</code>
                            </Descriptions.Item>
                            <Descriptions.Item label="Trace ID">
                                <code className="text-xs">{selectedLog.trace_id || '-'}</code>
                            </Descriptions.Item>
                            <Descriptions.Item label="时间">
                                {selectedLog.timestamp ? dayjs(selectedLog.timestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="操作人">
                                {selectedLog.username || '-'} {selectedLog.user_id ? `(ID: ${selectedLog.user_id})` : ''}
                            </Descriptions.Item>
                            <Descriptions.Item label="动作">
                                <Tag color="blue">{ACTION_MAP[selectedLog.action] || selectedLog.action}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="资源">
                                <code className="text-xs">{selectedLog.target_type}</code>
                                {selectedLog.target_id && ` : ${selectedLog.target_id}`}
                                {selectedLog.target_name && ` (${selectedLog.target_name})`}
                            </Descriptions.Item>
                            <Descriptions.Item label="IP 地址">
                                {selectedLog.ip_address || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="结果">
                                <Tag color={selectedLog.result === 'success' ? 'green' : 'red'}>
                                    {selectedLog.result === 'success' ? '成功' : '失败'}
                                </Tag>
                                {selectedLog.reason && <span className="text-red-500 ml-2">{selectedLog.reason}</span>}
                            </Descriptions.Item>
                            {selectedLog.detail && (
                                <Descriptions.Item label="详细信息">
                                    <pre className="text-xs bg-slate-50 p-3 rounded-lg whitespace-pre-wrap max-h-48 overflow-auto">
                                        {typeof selectedLog.detail === 'string'
                                            ? selectedLog.detail
                                            : JSON.stringify(selectedLog.detail, null, 2)}
                                    </pre>
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                    </div>
                )}
            </Drawer>
        </div>
    );
};

export default AuditLogs;
