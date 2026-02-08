import React, { useEffect, useState } from 'react';
import { Table, Tag, Select, Drawer, Descriptions, Statistic, Card, Row, Col, DatePicker, Tooltip } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, DatabaseOutlined, CloudOutlined, UserOutlined, AuditOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import { BusinessLog } from '../../types';
import dayjs from 'dayjs';
import AppButton from '../../components/AppButton';

const ACTION_MAP: Record<string, string> = {
    'LOGIN': '用户登录',
    'CREATE_USER': '创建用户',
    'DELETE_USER': '删除用户',
    'UPDATE_USER': '更新用户',
    'RESET_PASSWORD': '重置密码',
    'APP_LAUNCH': '启动应用',
    'SEARCH_QUERY': '搜索查询',
    'CREATE_NEWS': '新增新闻',
    'UPDATE_NEWS': '更新新闻',
    'DELETE_NEWS': '删除新闻',
    'CREATE_ANNOUNCEMENT': '新增公告',
    'UPDATE_ANNOUNCEMENT': '更新公告',
    'DELETE_ANNOUNCEMENT': '删除公告',
    'CREATE_CAROUSEL_ITEM': '新增轮播图',
    'UPDATE_CAROUSEL_ITEM': '更新轮播图',
    'DELETE_CAROUSEL_ITEM': '删除轮播图',
    'CREATE_APP': '新增应用',
    'UPDATE_APP': '更新应用',
    'UPDATE_APP_PERMISSION': '更新应用权限',
    'DELETE_APP': '删除应用',
    'CREATE_AI_PROVIDER': '新增AI供应商',
    'UPDATE_AI_PROVIDER': '更新AI供应商',
    'DELETE_AI_PROVIDER': '删除AI供应商',
    'CREATE_AI_POLICY': '新增AI安全策略',
    'UPDATE_AI_POLICY': '更新AI安全策略',
    'DELETE_AI_POLICY': '删除AI安全策略',
    'UPDATE_SYSTEM_CONFIG': '更新系统配置',
    'CREATE_EMPLOYEE': '新增用户',
    'UPDATE_EMPLOYEE': '更新用户',
    'DELETE_EMPLOYEE': '删除用户',
    'CREATE_ROLE': '新增角色',
    'UPDATE_ROLE': '更新角色',
    'DELETE_ROLE': '删除角色',
    'CREATE_DEPARTMENT': '新增部门',
    'UPDATE_DEPARTMENT': '更新部门',
    'DELETE_DEPARTMENT': '删除部门',
};

const ACTION_CATEGORIES: Record<string, { label: string; color: string }> = {
    'LOGIN': { label: '登录', color: 'cyan' },
    'CREATE': { label: '创建', color: 'green' },
    'UPDATE': { label: '更新', color: 'blue' },
    'DELETE': { label: '删除', color: 'red' },
    'OTHER': { label: '其他', color: 'default' }
};

const getActionCategory = (action: string): { label: string; color: string } => {
    if (action.startsWith('CREATE')) return ACTION_CATEGORIES['CREATE'];
    if (action.startsWith('UPDATE')) return ACTION_CATEGORIES['UPDATE'];
    if (action.startsWith('DELETE')) return ACTION_CATEGORIES['DELETE'];
    if (action === 'LOGIN') return ACTION_CATEGORIES['LOGIN'];
    return ACTION_CATEGORIES['OTHER'];
};

interface LogStats {
    total: number;           // 操作总数
    todayCount: number;      // 今日操作
    createCount: number;     // 创建操作
    modifyCount: number;     // 变更操作 (UPDATE + DELETE)
}

const BusinessLogs: React.FC = () => {
    const [logs, setLogs] = useState<BusinessLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<LogStats>({ total: 0, todayCount: 0, createCount: 0, modifyCount: 0 });
    const [selectedLog, setSelectedLog] = useState<BusinessLog | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Filters
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
    const [actionFilter, setActionFilter] = useState<string | undefined>();
    const [statusFilter, setStatusFilter] = useState<string | undefined>();
    const [sourceFilter, setSourceFilter] = useState<string>('all');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getBusinessLogs({
                action: actionFilter,
                source: sourceFilter
            });
            setLogs(data);

            // Calculate business-specific stats
            const today = dayjs().format('YYYY-MM-DD');
            const todayLogs = data.filter((log: BusinessLog) => log.timestamp?.startsWith(today));
            const createLogs = data.filter((log: BusinessLog) => log.action?.startsWith('CREATE'));
            const modifyLogs = data.filter((log: BusinessLog) =>
                log.action?.startsWith('UPDATE') || log.action?.startsWith('DELETE')
            );
            setStats({
                total: data.length,
                todayCount: todayLogs.length,
                createCount: createLogs.length,
                modifyCount: modifyLogs.length
            });
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [sourceFilter]);

    const handleViewDetail = (record: BusinessLog) => {
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
            dataIndex: 'operator',
            key: 'operator',
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
                        <Tag color={category.color} icon={<AuditOutlined />}>
                            {ACTION_MAP[text] || text}
                        </Tag>
                    </Tooltip>
                );
            }
        },
        {
            title: '目标对象',
            dataIndex: 'target',
            key: 'target',
            width: 150,
            render: (text: string) => (
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600">
                    {text || '-'}
                </span>
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
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 90,
            render: (status: string) => (
                <Tag
                    color={status === 'SUCCESS' ? 'green' : 'red'}
                    icon={status === 'SUCCESS' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                >
                    {status === 'SUCCESS' ? '成功' : '失败'}
                </Tag>
            )
        },
        {
            title: '来源',
            dataIndex: 'source',
            key: 'source',
            width: 100,
            render: (source: string) => {
                // Handle combined source like 'DB,LOKI'
                if (source?.includes(',')) {
                    const sources = source.split(',');
                    return (
                        <span className="flex gap-1">
                            {sources.map((s, i) => (
                                <Tag key={i} color={s.trim() === 'LOKI' ? 'purple' : 'cyan'} className="text-xs">
                                    {s.trim()}
                                </Tag>
                            ))}
                        </span>
                    );
                }
                return (
                    <Tag color={source === 'LOKI' ? 'purple' : 'cyan'} className="text-xs">
                        {source || 'DB'}
                    </Tag>
                );
            }
        },
        {
            title: '操作',
            key: 'actions',
            width: 80,
            render: (_: any, record: BusinessLog) => (
                <AppButton intent="tertiary" size="sm" onClick={() => handleViewDetail(record)}>详情</AppButton>
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
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">业务日志</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">审计关键业务操作与安全记录</p>
                </div>
                <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>刷新</AppButton>
            </div>

            {/* Stats Cards - Business Specific */}
            <Row gutter={16} className="mb-4">
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic
                            title="操作总数"
                            value={stats.total}
                            prefix={<AuditOutlined />}
                            valueStyle={{ color: '#1890ff' }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic
                            title="今日操作"
                            value={stats.todayCount}
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic
                            title="创建操作"
                            value={stats.createCount}
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{ color: '#13c2c2' }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card className="rounded-2xl shadow-sm">
                        <Statistic
                            title="变更操作"
                            value={stats.modifyCount}
                            prefix={<AuditOutlined />}
                            valueStyle={{ color: '#722ed1' }}
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
                    placeholder={['开始时间', '结束时间']}
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
                    placeholder="状态筛选"
                    allowClear
                    value={statusFilter}
                    onChange={setStatusFilter}
                    className="w-28"
                    options={[
                        { value: 'SUCCESS', label: '成功' },
                        { value: 'FAIL', label: '失败' },
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
                <AppButton intent="primary" onClick={fetchLogs} loading={loading}>查询</AppButton>
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
                    locale={{ emptyText: '暂无业务日志' }}
                    className="ant-table-custom"
                />
            </div>

            {/* Detail Drawer */}
            <Drawer
                title="业务日志详情"
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
                            <Descriptions.Item label="时间">
                                {selectedLog.timestamp ? dayjs(selectedLog.timestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="操作人">
                                {selectedLog.operator || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="动作">
                                <Tag color="blue">{ACTION_MAP[selectedLog.action] || selectedLog.action}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="目标对象">
                                <code className="text-xs">{selectedLog.target || '-'}</code>
                            </Descriptions.Item>
                            <Descriptions.Item label="IP 地址">
                                {selectedLog.ip_address || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="状态">
                                <Tag color={selectedLog.status === 'SUCCESS' ? 'green' : 'red'}>
                                    {selectedLog.status === 'SUCCESS' ? '成功' : '失败'}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="来源">
                                <Tag color="purple">{selectedLog.source || 'DB'}</Tag>
                            </Descriptions.Item>
                            {selectedLog.detail && (
                                <Descriptions.Item label="详细信息">
                                    <pre className="text-xs bg-slate-50 p-3 rounded-lg whitespace-pre-wrap max-h-48 overflow-auto">
                                        {selectedLog.detail}
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

export default BusinessLogs;
