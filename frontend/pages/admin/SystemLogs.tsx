
import React, { useEffect, useState } from 'react';
import { Table, Tag, Input, Select, Card, Button } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import { SystemLog } from '../../types';

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
            width: 200,
            render: (text: string) => <span className="font-mono text-slate-500 font-medium">{text}</span>
        },
        {
            title: '级别',
            dataIndex: 'level',
            key: 'level',
            width: 100,
            render: (level: string) => {
                let color = 'blue';
                if (level === 'WARN') color = 'orange';
                if (level === 'ERROR') color = 'red';
                return <Tag color={color} className="font-bold border-0 px-2 rounded-lg">{level}</Tag>;
            }
        },
        {
            title: '模块',
            dataIndex: 'module',
            key: 'module',
            width: 150,
            render: (text: string) => <Tag className="bg-slate-100 text-slate-600 font-bold border-0 rounded-lg">{text}</Tag>
        },
        {
            title: '消息內容',
            dataIndex: 'message',
            key: 'message',
            ellipsis: true,
            render: (text: string) => <span className="font-medium text-slate-700 dark:text-slate-300">{text}</span>
        },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">系统日志</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">监控系统运行状态与异常</p>
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
                <div className="mb-6 bg-slate-50 dark:bg-slate-900 p-2 rounded-2xl border border-slate-100 dark:border-slate-700 inline-block">
                    <Select
                        placeholder="选择日志级别"
                        allowClear
                        variant="borderless"
                        style={{ width: 150 }}
                        onChange={setFilterLevel}
                        className="font-bold"
                        options={[
                            { value: 'INFO', label: <span className="text-blue-500 font-bold">INFO</span> },
                            { value: 'WARN', label: <span className="text-orange-500 font-bold">WARN</span> },
                            { value: 'ERROR', label: <span className="text-rose-500 font-bold">ERROR</span> },
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
