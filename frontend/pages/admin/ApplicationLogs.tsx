
import React, { useEffect, useState } from 'react';
import { Table, Tag, Card, Button, Input, Select, DatePicker, message, Modal } from 'antd';
import { SearchOutlined, ReloadOutlined, BugOutlined, ExclamationCircleOutlined, InfoCircleOutlined, ConsoleSqlOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import { SystemLog } from '../../types';

const { Option } = Select;
const { TextArea } = Input;

const ApplicationLogs: React.FC = () => {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [level, setLevel] = useState<string | undefined>(undefined);

    // Modal state for detailed view
    const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getApplicationLogs({ level, limit: 100 });
            setLogs(data);
        } catch (error) {
            message.error('获取系统日志失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [level]);

    const handleViewDetail = (log: SystemLog) => {
        setSelectedLog(log);
        setIsModalOpen(true);
    };

    const columns = [
        {
            title: '时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (text: string) => <span className="font-mono text-xs text-slate-500">{new Date(text).toLocaleString()}</span>
        },
        {
            title: '级别',
            dataIndex: 'level',
            key: 'level',
            width: 100,
            render: (level: string) => {
                let color = 'blue';
                let icon = <InfoCircleOutlined />;
                if (level === 'WARN') { color = 'gold'; icon = <ExclamationCircleOutlined />; }
                if (level === 'ERROR') { color = 'red'; icon = <BugOutlined />; }
                if (level === 'CRITICAL') { color = 'purple'; icon = <BugOutlined />; }

                return (
                    <Tag color={color} icon={icon} className="rounded-lg px-2 py-1 font-bold">
                        {level}
                    </Tag>
                );
            }
        },
        {
            title: '模块',
            dataIndex: 'module',
            key: 'module',
            width: 150,
            render: (text: string) => (
                <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 rounded px-2 py-1">
                    {text}
                </span>
            )
        },
        {
            title: '消息内容',
            dataIndex: 'message',
            key: 'message',
            render: (text: string) => (
                <span className="font-mono text-xs text-slate-700 truncate block max-w-lg cursor-pointer hover:text-blue-600" title={text}>
                    {text.length > 80 ? text.substring(0, 80) + '...' : text}
                </span>
            ),
            onCell: (record: SystemLog) => ({
                onClick: () => handleViewDetail(record),
            }),
        },
        {
            title: '操作',
            key: 'action',
            width: 100,
            render: (_: any, record: SystemLog) => (
                <Button type="link" size="small" onClick={() => handleViewDetail(record)}>
                    查看详情
                </Button>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">系统应用日志</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">查看系统内部事件、报错堆栈及运行状态 (Dev/Ops)</p>
                </div>
                <div className="flex gap-3">
                    <Select
                        placeholder="选择日志级别"
                        allowClear
                        className="w-40"
                        onChange={(value) => setLevel(value)}
                    >
                        <Option value="INFO">INFO (信息)</Option>
                        <Option value="WARN">WARN (警告)</Option>
                        <Option value="ERROR">ERROR (错误)</Option>
                    </Select>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchLogs}
                        loading={loading}
                        className="rounded-xl font-bold"
                    >
                        刷新
                    </Button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <Table
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    className="ant-table-custom"
                    pagination={{ pageSize: 20 }}
                />
            </div>

            {/* Detail Modal */}
            <Modal
                title={
                    <div className="flex items-center space-x-2">
                        <BugOutlined className="text-slate-400" />
                        <span>日志详情</span>
                    </div>
                }
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={[
                    <Button key="close" onClick={() => setIsModalOpen(false)}>关闭</Button>
                ]}
                width={800}
                className="rounded-2xl"
            >
                {selectedLog && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-xs font-mono border border-slate-100">
                            <div>
                                <span className="text-slate-400 block mb-1">时间</span>
                                <span className="font-bold text-slate-700">{new Date(selectedLog.timestamp).toLocaleString()}</span>
                            </div>
                            <div>
                                <span className="text-slate-400 block mb-1">级别</span>
                                <Tag color={selectedLog.level === 'ERROR' ? 'red' : 'blue'}>{selectedLog.level}</Tag>
                            </div>
                            <div>
                                <span className="text-slate-400 block mb-1">模块</span>
                                <span className="font-bold text-slate-700">{selectedLog.module}</span>
                            </div>
                            <div>
                                <span className="text-slate-400 block mb-1">ID</span>
                                <span className="font-bold text-slate-700">#{selectedLog.id}</span>
                            </div>
                        </div>

                        <div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">详细内容 / Stack Trace</span>
                            <div className="bg-slate-900 text-slate-50 p-4 rounded-xl font-mono text-xs overflow-auto max-h-[400px] whitespace-pre-wrap leading-relaxed shadow-inner">
                                {selectedLog.message}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ApplicationLogs;
