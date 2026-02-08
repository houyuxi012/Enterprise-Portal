
import React, { useEffect, useState } from 'react';
import { Table, Tag, Input, Select, Card } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import { SystemLog } from '../../types';
import AppButton from '../../components/AppButton';

const SystemLogs: React.FC = () => {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterLevel, setFilterLevel] = useState<string | undefined>(undefined);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getSystemLogs({ level: filterLevel });
            setLogs(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [filterLevel]);

    const columns = [
        {
            title: '时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (text: string) => <span className="font-mono text-slate-500 font-medium text-xs">{text.substring(0, 19).replace('T', ' ')}</span>
        },
        {
            title: 'IP地址',
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 140,
            render: (text: string) => <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{text || '-'}</span>
        },
        {
            title: '请求方法',
            dataIndex: 'method',
            key: 'method',
            width: 100,
            render: (text: string) => <Tag className={`font-bold border-0 rounded-md ${text === 'GET' ? 'bg-blue-50 text-blue-600' : text === 'POST' ? 'bg-green-50 text-green-600' : 'bg-slate-100'}`}>{text}</Tag>
        },
        {
            title: '请求路径',
            dataIndex: 'request_path',
            key: 'request_path',
            render: (text: string) => <span className="font-mono text-xs text-slate-600 dark:text-slate-400 max-w-[200px] truncate block" title={text}>{text}</span>
        },
        {
            title: '状态',
            dataIndex: 'status_code',
            key: 'status_code',
            width: 80,
            render: (code: number) => {
                let color = 'text-green-600';
                if (code >= 300) color = 'text-blue-600';
                if (code >= 400) color = 'text-orange-500';
                if (code >= 500) color = 'text-rose-600';
                return <span className={`font-black font-mono ${color}`}>{code}</span>;
            }
        },
        {
            title: '耗时',
            dataIndex: 'response_time',
            key: 'response_time',
            width: 100,
            render: (time: number) => <span className={`font-mono text-xs font-bold ${time > 1 ? 'text-red-500' : 'text-slate-500'}`}>{time ? `${(time * 1000).toFixed(0)}ms` : '-'}</span>
        },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">访问日志</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">记录系统所有 API 请求与访问详情</p>
                </div>
                <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={fetchLogs}>刷新</AppButton>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <div className="mb-6 bg-slate-50 dark:bg-slate-900 p-2 rounded-2xl border border-slate-100 dark:border-slate-700 inline-block">
                    <Select
                        placeholder="选择状态"
                        allowClear
                        variant="borderless"
                        style={{ width: 150 }}
                        onChange={setFilterLevel}
                        className="font-bold"
                        options={[
                            { value: 'INFO', label: <span className="text-blue-500 font-bold">INFO (200)</span> },
                            { value: 'WARN', label: <span className="text-orange-500 font-bold">WARN (400)</span> },
                            { value: 'ERROR', label: <span className="text-rose-500 font-bold">ERROR (500)</span> },
                        ]}
                    />
                </div>
                <Table
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20, className: 'font-bold' }}
                    className="ant-table-custom"
                />
            </div>
        </div>
    );
};

export default SystemLogs;
