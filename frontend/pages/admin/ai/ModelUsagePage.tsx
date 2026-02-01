import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, InputNumber, message, Progress, Tag, Select, Switch } from 'antd';
import { EditOutlined, BarChartOutlined } from '@ant-design/icons';
import ApiClient from '../../../services/api';

const ModelUsagePage: React.FC = () => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [timeRange, setTimeRange] = useState<number>(30 * 24); // Default 30 Days
    const [showAllModels, setShowAllModels] = useState(false); // Default: Only Active

    // Edit Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingModel, setEditingModel] = useState<any>(null);
    const [form] = Form.useForm();

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await ApiClient.getAIModelUsage(timeRange);
            setData(res);
        } catch (error) {
            console.error(error);
            message.error("获取数据失败");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [timeRange]);

    const handleEdit = (record: any) => {
        setEditingModel(record);
        form.setFieldsValue({
            daily_token_limit: record.daily_token_limit,
            daily_request_limit: record.daily_request_limit
        });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            await ApiClient.updateAIModelQuota({
                model_name: editingModel.model_name,
                ...values
            });
            message.success("更新成功");
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            message.error("更新失败");
        }
    };

    const columns = [
        {
            title: '模型名称',
            dataIndex: 'model_name',
            key: 'model_name',
            render: (text: string, record: any) => (
                <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{text}</span>
                    {!record.is_active && (
                        <Tag color="default" bordered={false} className="text-xs">历史</Tag>
                    )}
                    {record.is_active && (
                        <Tag color="blue" bordered={false} className="text-xs">配置中</Tag>
                    )}
                </div>
            )
        },
        {
            title: '时段内总消耗',
            dataIndex: 'period_tokens',
            key: 'period_tokens',
            width: 150,
            render: (val: number) => <span className="font-black text-slate-800 dark:text-white">{val?.toLocaleString() || 0}</span>,
            sorter: (a: any, b: any) => (a.period_tokens || 0) - (b.period_tokens || 0),
        },
        {
            title: '峰值单日用量 (Tokens)',
            dataIndex: 'peak_daily_tokens',
            key: 'peak_daily_tokens',
            render: (val: number) => <span className="font-medium">{val?.toLocaleString() || 0}</span>,
            sorter: (a: any, b: any) => (a.peak_daily_tokens || 0) - (b.peak_daily_tokens || 0),
        },
        {
            title: '单日 Token 限额',
            dataIndex: 'daily_token_limit',
            key: 'daily_token_limit',
            width: 300,
            render: (val: number, record: any) => {
                if (!val || val === 0) return <Tag color="green">无限制</Tag>;

                const peak = record.peak_daily_tokens || 0;
                const percent = Math.min((peak / val) * 100, 100);
                let color = 'success';
                if (percent > 80) color = 'warning';

                return (
                    <div className="w-full">
                        <div className="flex justify-between text-xs mb-1 text-slate-500 dark:text-slate-400">
                            <span>{val.toLocaleString()}</span>
                            <span className={percent >= 100 ? 'text-rose-500 font-bold' : ''}>
                                峰值占 {percent.toFixed(1)}%
                            </span>
                        </div>
                        <Progress percent={percent} size="small" status={percent >= 100 ? 'exception' : 'active'} strokeColor={percent >= 100 ? '#f43f5e' : (percent > 80 ? '#f59e0b' : '#10b981')} showInfo={false} />
                    </div>
                );
            }
        },
        {
            title: '今日实时消耗',
            dataIndex: 'current_daily_tokens',
            key: 'current_daily_tokens',
            render: (val: number) => <span className="font-medium text-blue-600 dark:text-blue-400">{val?.toLocaleString() || 0}</span>
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: any) => (
                <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                    设置限额
                </Button>
            )
        }
    ];

    const filteredData = showAllModels ? data : data.filter(item => item.is_active);

    return (
        <div className="space-y-6">
            <div className="mica rounded-[2.5rem] p-8 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                            <BarChartOutlined className="text-blue-600" />
                            模型用量监控
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">监控各 AI 模型的历史峰值用量与限额对比</p>
                    </div>
                    <div className="flex items-center space-x-4">
                        <Select
                            value={timeRange}
                            onChange={setTimeRange}
                            style={{ width: 140 }}
                            className="font-bold"
                            options={[
                                { label: '过去1小时', value: 1 },
                                { label: '过去24小时', value: 24 },
                                { label: '过去7天', value: 7 * 24 },
                                { label: '过去30天', value: 30 * 24 },
                                { label: '过去90天', value: 90 * 24 },
                            ]}
                        />
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">显示历史模型</span>
                            <Switch checked={showAllModels} onChange={setShowAllModels} />
                        </div>
                    </div>
                </div>

                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="model_name"
                    loading={loading}
                    pagination={false}
                    className="rounded-2xl overflow-hidden"
                />
            </div>

            <Modal
                title={`设置限额 - ${editingModel?.model_name}`}
                open={isModalOpen}
                onOk={handleSave}
                onCancel={() => setIsModalOpen(false)}
                className="mica-modal"
            >
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item
                        label="每日 Token 限额 (0表示无限制)"
                        name="daily_token_limit"
                        extra="设置该模型允许的最大单日 Token 消耗量"
                    >
                        <InputNumber style={{ width: '100%' }} min={0} size="large" />
                    </Form.Item>
                    <Form.Item
                        label="每日调用次数限额 (0表示无限制)"
                        name="daily_request_limit"
                        extra="设置该模型允许的最大单日请求次数"
                    >
                        <InputNumber style={{ width: '100%' }} min={0} size="large" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ModelUsagePage;
