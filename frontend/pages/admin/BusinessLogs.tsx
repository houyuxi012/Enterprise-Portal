
import React, { useEffect, useState } from 'react';
import { Table, Tag, Input, Select, Card, Button } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import { BusinessLog } from '../../types';

const BusinessLogs: React.FC = () => {
    const [logs, setLogs] = useState<BusinessLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterOperator, setFilterOperator] = useState<string>('');
    const [filterAction, setFilterAction] = useState<string>('');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getBusinessLogs({
                operator: filterOperator || undefined,
                action: filterAction || undefined
            });
            setLogs(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const ACTION_MAP: Record<string, string> = {
        'LOGIN': '用户登录',
        'CREATE_USER': '创建用户',
        'DELETE_USER': '删除用户',
        'UPDATE_USER': '更新用户',
        'RESET_PASSWORD': '重置密码',
        'APP_LAUNCH': '启动应用',
        'SEARCH_QUERY': '搜索查询',
        // News
        'CREATE_NEWS': '新增新闻',
        'UPDATE_NEWS': '更新新闻',
        'DELETE_NEWS': '删除新闻',
        // Announcement
        'CREATE_ANNOUNCEMENT': '新增公告',
        'UPDATE_ANNOUNCEMENT': '更新公告',
        'DELETE_ANNOUNCEMENT': '删除公告',
        // Carousel
        'CREATE_CAROUSEL_ITEM': '新增轮播图',
        'UPDATE_CAROUSEL_ITEM': '更新轮播图',
        'DELETE_CAROUSEL_ITEM': '删除轮播图',
        // App Center
        'CREATE_APP': '新增应用',
        'UPDATE_APP': '更新应用',
        'DELETE_APP': '删除应用',
        // AI Admin
        'CREATE_AI_PROVIDER': '新增AI供应商',
        'UPDATE_AI_PROVIDER': '更新AI供应商',
        'DELETE_AI_PROVIDER': '删除AI供应商',
        'CREATE_AI_POLICY': '新增AI安全策略',
        'UPDATE_AI_POLICY': '更新AI安全策略',
        'DELETE_AI_POLICY': '删除AI安全策略',
        // System & Org
        'UPDATE_SYSTEM_CONFIG': '更新系统配置',
        // 'RESET_PASSWORD' is already defined above
        'CREATE_EMPLOYEE': '新增员工',
        'UPDATE_EMPLOYEE': '更新员工',
        'DELETE_EMPLOYEE': '删除员工',
        'CREATE_ROLE': '新增角色',
        'UPDATE_ROLE': '更新角色',
        'DELETE_ROLE': '删除角色',
        'CREATE_DEPARTMENT': '新增部门',
        'UPDATE_DEPARTMENT': '更新部门',
        'DELETE_DEPARTMENT': '删除部门',
    };

    const STATUS_MAP: Record<string, string> = {
        'SUCCESS': '成功',
        'FAIL': '失败'
    };

    const columns = [
        {
            title: '时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (text: string) => <span className="font-mono text-slate-500 font-medium">{text}</span>
        },
        {
            title: '操作人',
            dataIndex: 'operator',
            key: 'operator',
            width: 120,
            render: (text: string) => <span className="font-bold text-slate-700 dark:text-slate-200">{text}</span>
        },
        {
            title: '动作',
            dataIndex: 'action',
            key: 'action',
            width: 150,
            render: (text: string) => <Tag color="blue" className="rounded-lg font-bold border-0 bg-blue-50 text-blue-600 px-2">{ACTION_MAP[text] || text}</Tag>
        },
        {
            title: '目标对象',
            dataIndex: 'target',
            key: 'target',
            width: 150,
            render: (text: string) => <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600">{text}</span>
        },
        {
            title: 'IP地址',
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 120,
            render: (text: string) => <span className="font-mono text-xs text-slate-400">{text}</span>
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string) => (
                <Tag color={status === 'SUCCESS' ? 'green' : 'red'} className="rounded-lg font-bold border-0 uppercase">
                    {STATUS_MAP[status] || status}
                </Tag>
            )
        },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">业务日志</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">审计关键业务操作与安全记录</p>
                </div>
                <Button
                    icon={<ReloadOutlined />}
                    onClick={fetchLogs}
                    className="rounded-xl px-4 border-slate-200 shadow-sm font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200"
                >
                    刷新
                </Button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <div className="mb-6 flex gap-4 bg-slate-50 dark:bg-slate-900 p-2 rounded-2xl border border-slate-100 dark:border-slate-700 w-fit">
                    <Input
                        placeholder="搜索操作人"
                        bordered={false}
                        style={{ width: 200 }}
                        value={filterOperator}
                        onChange={e => setFilterOperator(e.target.value)}
                        onPressEnter={fetchLogs}
                        prefix={<SearchOutlined className="text-slate-400" />}
                        className="bg-transparent font-medium"
                    />
                    <div className="w-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                    <Input
                        placeholder="搜索动作 (如 CREATE_USER)"
                        bordered={false}
                        style={{ width: 240 }}
                        value={filterAction}
                        onChange={e => setFilterAction(e.target.value)}
                        onPressEnter={fetchLogs}
                        className="bg-transparent font-medium"
                    />
                    <Button type="primary" onClick={fetchLogs} className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20">查询</Button>
                </div>
                <Table
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20, className: 'font-bold' }}
                    className="ant-table-custom"
                    expandable={{
                        expandedRowRender: (record) => (
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 ml-12">
                                <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">详细信息</h4>
                                <p className="font-mono text-sm text-slate-600 dark:text-slate-300 break-all">{record.detail || '暂无详细信息'}</p>
                            </div>
                        )
                    }}
                />
            </div>
        </div>
    );
};

export default BusinessLogs;
