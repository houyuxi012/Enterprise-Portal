
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
                return <Tag color={color}>{level}</Tag>;
            }
        },
        {
            title: '模块',
            dataIndex: 'module',
            key: 'module',
            width: 150,
            render: (text: string) => <Tag>{text}</Tag>
        },
        {
            title: '消息內容',
            dataIndex: 'message',
            key: 'message',
            ellipsis: true,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">系统日志</h1>
                    <p className="text-slate-500">监控系统运行状态与异常</p>
                </div>
                <Button icon={<ReloadOutlined />} onClick={fetchLogs}>刷新</Button>
            </div>

            <Card>
                <div className="mb-4 flex gap-4">
                    <Select
                        placeholder="选择日志级别"
                        allowClear
                        style={{ width: 150 }}
                        onChange={setFilterLevel}
                        options={[
                            { value: 'INFO', label: 'INFO' },
                            { value: 'WARN', label: 'WARN' },
                            { value: 'ERROR', label: 'ERROR' },
                        ]}
                    />
                </div>
                <Table
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                />
            </Card>
        </div>
    );
};

export default SystemLogs;
