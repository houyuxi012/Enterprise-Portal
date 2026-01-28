
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

    const columns = [
        {
            title: '时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
        },
        {
            title: '操作人',
            dataIndex: 'operator',
            key: 'operator',
            width: 120,
        },
        {
            title: '动作',
            dataIndex: 'action',
            key: 'action',
            width: 150,
            render: (text: string) => <Tag color="blue">{text}</Tag>
        },
        {
            title: '目标对象',
            dataIndex: 'target',
            key: 'target',
            width: 150,
        },
        {
            title: 'IP地址',
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 120,
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string) => (
                <Tag color={status === 'SUCCESS' ? 'green' : 'red'}>
                    {status}
                </Tag>
            )
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">业务日志</h1>
                    <p className="text-slate-500">审计关键业务操作记录</p>
                </div>
                <Button icon={<ReloadOutlined />} onClick={fetchLogs}>刷新</Button>
            </div>

            <Card>
                <div className="mb-4 flex gap-4">
                    <Input
                        placeholder="搜索操作人"
                        style={{ width: 200 }}
                        value={filterOperator}
                        onChange={e => setFilterOperator(e.target.value)}
                        onPressEnter={fetchLogs}
                        prefix={<SearchOutlined />}
                    />
                    <Input
                        placeholder="搜索动作 (如 CREATE_USER)"
                        style={{ width: 200 }}
                        value={filterAction}
                        onChange={e => setFilterAction(e.target.value)}
                        onPressEnter={fetchLogs}
                    />
                    <Button type="primary" onClick={fetchLogs}>查询</Button>
                </div>
                <Table
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    expandable={{
                        expandedRowRender: (record) => (
                            <div className="p-4 bg-gray-50 rounded">
                                <p className="font-mono text-sm">{record.detail || 'No details provided.'}</p>
                            </div>
                        )
                    }}
                />
            </Card>
        </div>
    );
};

export default BusinessLogs;
