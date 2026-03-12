import React, { useState, useEffect } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Form from 'antd/es/form';
import InputNumber from 'antd/es/input-number';
import Progress from 'antd/es/progress';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { AppButton, AppModal, AppPageHeader, AppTable } from '@/modules/admin/components/ui';

const { Text } = Typography;

const ModelUsagePage: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
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
            message.error(t('modelUsagePage.messages.loadFailed'));
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
            message.success(t('modelUsagePage.messages.updateSuccess'));
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            message.error(t('modelUsagePage.messages.updateFailed'));
        }
    };

    const columns = [
        {
            title: t('modelUsagePage.table.modelName'),
            dataIndex: 'model_name',
            key: 'model_name',
            render: (text: string, record: any) => (
                <Space size="small">
                    <Text strong>{text}</Text>
                    {!record.is_active && (
                        <Tag color="default" variant="filled" className="text-xs">{t('modelUsagePage.status.history')}</Tag>
                    )}
                    {record.is_active && (
                        <Tag color="blue" variant="filled" className="text-xs">{t('modelUsagePage.status.configured')}</Tag>
                    )}
                </Space>
            )
        },
        {
            title: t('modelUsagePage.table.periodTokens'),
            dataIndex: 'period_tokens',
            key: 'period_tokens',
            width: 150,
            render: (val: number) => <Text strong>{val?.toLocaleString() || 0}</Text>,
            sorter: (a: any, b: any) => (a.period_tokens || 0) - (b.period_tokens || 0),
        },
        {
            title: t('modelUsagePage.table.peakDailyTokens'),
            dataIndex: 'peak_daily_tokens',
            key: 'peak_daily_tokens',
            render: (val: number) => <Text>{val?.toLocaleString() || 0}</Text>,
            sorter: (a: any, b: any) => (a.peak_daily_tokens || 0) - (b.peak_daily_tokens || 0),
        },
        {
            title: t('modelUsagePage.table.dailyTokenLimit'),
            dataIndex: 'daily_token_limit',
            key: 'daily_token_limit',
            width: 300,
            render: (val: number, record: any) => {
                if (!val || val === 0) return <Tag color="green">{t('modelUsagePage.status.unlimited')}</Tag>;

                const peak = record.peak_daily_tokens || 0;
                const percent = Math.min((peak / val) * 100, 100);
                let color = 'success';
                if (percent > 80) color = 'warning';

                return (
                    <div className="w-full">
                        <Space className="mb-1 flex w-full justify-between">
                            <Text type="secondary">{val.toLocaleString()}</Text>
                            <Text strong={percent >= 100} style={percent >= 100 ? { color: '#f43f5e' } : undefined}>
                                {t('modelUsagePage.table.peakRatio', { percent: percent.toFixed(1) })}
                            </Text>
                        </Space>
                        <Progress percent={percent} size="small" status={percent >= 100 ? 'exception' : 'active'} strokeColor={percent >= 100 ? '#f43f5e' : (percent > 80 ? '#f59e0b' : '#10b981')} showInfo={false} />
                    </div>
                );
            }
        },
        {
            title: t('modelUsagePage.table.todayTokens'),
            dataIndex: 'current_daily_tokens',
            key: 'current_daily_tokens',
            render: (val: number) => <Text>{val?.toLocaleString() || 0}</Text>
        },
        {
            title: t('modelUsagePage.table.actions'),
            key: 'action',
            render: (_: any, record: any) => (
                <AppButton intent="tertiary" size="sm" icon={<EditOutlined />} onClick={() => handleEdit(record)}>{t('modelUsagePage.actions.setQuota')}</AppButton>
            )
        }
    ];

    const filteredData = showAllModels ? data : data.filter(item => item.is_active);

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('modelUsagePage.page.title')}
                subtitle={t('modelUsagePage.page.subtitle')}
                action={
                    <Space>
                        <Select
                            value={timeRange}
                            onChange={setTimeRange}
                            style={{ width: 140 }}
                            className="font-bold"
                            options={[
                                { label: t('modelUsagePage.filters.last1h'), value: 1 },
                                { label: t('modelUsagePage.filters.last24h'), value: 24 },
                                { label: t('modelUsagePage.filters.last7d'), value: 7 * 24 },
                                { label: t('modelUsagePage.filters.last30d'), value: 30 * 24 },
                                { label: t('modelUsagePage.filters.last90d'), value: 90 * 24 },
                            ]}
                        />
                        <Space size="small">
                            <Text type="secondary">{t('modelUsagePage.filters.showHistory')}</Text>
                            <Switch checked={showAllModels} onChange={setShowAllModels} />
                        </Space>
                    </Space>
                }
            />

            <Card className="admin-card overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="model_name"
                    loading={loading}
                    pagination={false}
                    locale={{ emptyText: t('modelUsagePage.table.empty') }}
                    className="align-middle"
                />
            </Card>

            <AppModal
                title={t('modelUsagePage.modal.title', { modelName: editingModel?.model_name || '-' })}
                open={isModalOpen}
                onOk={handleSave}
                onCancel={() => setIsModalOpen(false)}
                className="mica-modal"
            >
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item
                        label={t('modelUsagePage.modal.dailyTokenLimit')}
                        name="daily_token_limit"
                        extra={t('modelUsagePage.modal.dailyTokenLimitExtra')}
                    >
                        <InputNumber style={{ width: '100%' }} min={0} size="large" />
                    </Form.Item>
                    <Form.Item
                        label={t('modelUsagePage.modal.dailyRequestLimit')}
                        name="daily_request_limit"
                        extra={t('modelUsagePage.modal.dailyRequestLimitExtra')}
                    >
                        <InputNumber style={{ width: '100%' }} min={0} size="large" />
                    </Form.Item>
                </Form>
            </AppModal>
        </div>
    );
};

export default ModelUsagePage;
