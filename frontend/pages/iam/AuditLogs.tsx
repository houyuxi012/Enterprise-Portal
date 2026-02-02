import React, { useState, useEffect } from 'react';
import { Table, Tag, DatePicker, Button, Input, Select, Drawer, Descriptions, Typography, Space, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api'; // Ensure this path is correct
import dayjs from 'dayjs';


const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text } = Typography;

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

const AuditLogs: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<AuditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    // Filters
    const [username, setUsername] = useState('');
    const [action, setAction] = useState('');
    const [resultFilter, setResultFilter] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

    // Drawer
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [drawerVisible, setDrawerVisible] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params: any = {
                page,
                page_size: pageSize,
            };
            if (username) params.username = username;
            if (action) params.action = action;
            if (resultFilter) params.result = resultFilter;
            if (dateRange) {
                params.start_time = dateRange[0].toISOString();
                params.end_time = dateRange[1].toISOString();
            }

            const res = await ApiClient.getIamAuditLogs(params);

            setData(res.items || []);
            setTotal(res.total || 0);
        } catch (error) {
            console.error("Failed to fetch audit logs", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [page, pageSize]);

    const columns = [
        {
            title: '时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
        },
        {
            title: '操作人',
            dataIndex: 'username',
            key: 'username',
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
            title: '资源类型',
            dataIndex: 'target_type',
            key: 'target_type',
            width: 120,
        },
        {
            title: '结果',
            dataIndex: 'result',
            key: 'result',
            width: 100,
            render: (text: string) => {
                let color = 'default';
                if (text === 'success') color = 'success';
                if (text === 'failure') color = 'error';
                return <Tag color={color}>{text?.toUpperCase()}</Tag>;
            }
        },
        {
            title: 'IP地址',
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 130,
        },
        {
            title: '详情',
            key: 'operation',
            width: 80,
            render: (_: any, record: AuditLog) => (
                <Button
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => {
                        setSelectedLog(record);
                        setDrawerVisible(true);
                    }}
                />
            ),
        }
    ];

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">IAM 审计</h1>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
                </Space>
            </div>

            <div className="mb-4 flex flex-wrap gap-4">
                <Input
                    placeholder="用户名"
                    style={{ width: 150 }}
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    onPressEnter={fetchData}
                />
                <Input
                    placeholder="动作 (如 iam.login)"
                    style={{ width: 180 }}
                    value={action}
                    onChange={e => setAction(e.target.value)}
                    onPressEnter={fetchData}
                />
                <Select
                    placeholder="结果"
                    style={{ width: 120 }}
                    allowClear
                    onChange={val => setResultFilter(val)}
                >
                    <Option value="success">Success</Option>
                    <Option value="failure">Failure</Option>
                </Select>
                <RangePicker
                    showTime
                    onChange={(dates) => setDateRange(dates as any)}
                />
                <Button type="primary" icon={<SearchOutlined />} onClick={fetchData}>查询</Button>
            </div>

            <Table
                columns={columns}
                dataSource={data}
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
                scroll={{ x: 1000 }}
            />

            <Drawer
                title="日志详情"
                width={600}
                onClose={() => setDrawerVisible(false)}
                open={drawerVisible}
            >
                {selectedLog && (
                    <div className="space-y-6">
                        <Descriptions column={1} bordered>
                            <Descriptions.Item label="ID">{selectedLog.id}</Descriptions.Item>
                            <Descriptions.Item label="Trace ID">{selectedLog.trace_id || '-'}</Descriptions.Item>
                            <Descriptions.Item label="时间">{dayjs(selectedLog.timestamp).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                            <Descriptions.Item label="操作人">{selectedLog.username} (ID: {selectedLog.user_id})</Descriptions.Item>
                            <Descriptions.Item label="IP">{selectedLog.ip_address}</Descriptions.Item>
                            <Descriptions.Item label="资源">{selectedLog.target_type} : {selectedLog.target_id} ({selectedLog.target_name})</Descriptions.Item>
                            <Descriptions.Item label="结果">
                                <Tag color={selectedLog.result === 'success' ? 'success' : 'error'}>{selectedLog.result}</Tag>
                                {selectedLog.reason && <span className="text-red-500 ml-2">{selectedLog.reason}</span>}
                            </Descriptions.Item>
                        </Descriptions>

                        <div>
                            <h3 className="font-bold mb-2">详情数据 (JSON)</h3>
                            <div className="bg-gray-50 p-4 rounded border overflow-auto">
                                {selectedLog.detail ? (
                                    <pre className="text-xs">{JSON.stringify(selectedLog.detail, null, 2)}</pre>
                                ) : (
                                    <span className="text-gray-400">无详情数据</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </Drawer>
        </div>
    );
};

export default AuditLogs;
