
import React, { useEffect, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Descriptions from 'antd/es/descriptions';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { ReloadOutlined, BugOutlined, ExclamationCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { SystemLog } from '@/types';
import { AppButton, AppFilterBar, AppModal, AppPageHeader, AppTable } from '@/modules/admin/components/ui';

const { Text } = Typography;

const ApplicationLogs: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { message } = App.useApp();
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [level, setLevel] = useState<string | undefined>(undefined);

    // Modal state for detailed view
    const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getSystemLogs({ level, limit: 100 });
            setLogs(data);
        } catch (error) {
            message.error(t('applicationLogsPage.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchLogs();
    }, [level]);

    const formatTime = (value: string) => {
        const locale = i18n.resolvedLanguage?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
        return new Date(value).toLocaleString(locale);
    };

    const handleViewDetail = (log: SystemLog) => {
        setSelectedLog(log);
        setIsModalOpen(true);
    };

    const getLevelTag = (currentLevel: string) => {
        let color = 'blue';
        let icon = <InfoCircleOutlined />;
        if (currentLevel === 'WARN') { color = 'gold'; icon = <ExclamationCircleOutlined />; }
        if (currentLevel === 'ERROR') { color = 'red'; icon = <BugOutlined />; }
        if (currentLevel === 'CRITICAL') { color = 'purple'; icon = <BugOutlined />; }

        return (
            <Tag color={color} icon={icon}>
                {currentLevel}
            </Tag>
        );
    };

    const columns = [
        {
            title: t('applicationLogsPage.table.time'),
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (text: string) => <Text code>{formatTime(text)}</Text>
        },
        {
            title: t('applicationLogsPage.table.level'),
            dataIndex: 'level',
            key: 'level',
            width: 100,
            render: (currentLevel: string) => getLevelTag(currentLevel),
        },
        {
            title: t('applicationLogsPage.table.module'),
            dataIndex: 'module',
            key: 'module',
            width: 150,
            render: (text: string) => <Tag>{text}</Tag>,
        },
        {
            title: t('applicationLogsPage.table.message'),
            dataIndex: 'message',
            key: 'message',
            render: (text: string) => (
                <Text
                    ellipsis={{ tooltip: text }}
                    className="block max-w-lg cursor-pointer"
                    code
                >
                    {text}
                </Text>
            ),
            onCell: (record: SystemLog) => ({
                onClick: () => handleViewDetail(record),
            }),
        },
        {
            title: t('applicationLogsPage.table.actions'),
            key: 'action',
            width: 100,
            render: (_: any, record: SystemLog) => (
                <AppButton intent="tertiary" size="sm" onClick={() => handleViewDetail(record)}>{t('common.buttons.detail')}</AppButton>
            )
        }
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('applicationLogsPage.page.title')}
                subtitle={t('applicationLogsPage.page.subtitle')}
            />

            <AppFilterBar>
                <AppFilterBar.Select
                    value={level}
                    width={180}
                    placeholder={t('applicationLogsPage.filters.levelPlaceholder')}
                    options={[
                        { value: 'INFO', label: t('applicationLogsPage.filters.info') },
                        { value: 'WARN', label: t('applicationLogsPage.filters.warn') },
                        { value: 'ERROR', label: t('applicationLogsPage.filters.error') },
                    ]}
                    onChange={(value) => setLevel(typeof value === 'string' ? value : undefined)}
                />
                <AppFilterBar.Action>
                    <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={() => { void fetchLogs(); }} loading={loading}>
                        {t('common.buttons.refresh')}
                    </AppButton>
                </AppFilterBar.Action>
            </AppFilterBar>

            <Card className="admin-card">
                <AppTable<SystemLog>
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    locale={{ emptyText: t('applicationLogsPage.table.empty') }}
                    pagination={{ pageSize: 20 }}
                />
            </Card>

            <AppModal
                title={
                    <Space size="small">
                        <BugOutlined />
                        <span>{t('applicationLogsPage.modal.title')}</span>
                    </Space>
                }
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={[<AppButton key="close" intent="secondary" onClick={() => setIsModalOpen(false)}>{t('applicationLogsPage.modal.close')}</AppButton>]}
                width={800}
            >
                {selectedLog && (
                    <div className="space-y-4">
                        <Descriptions bordered size="middle" column={2} colon={false}>
                            <Descriptions.Item label={t('applicationLogsPage.modal.time')}>
                                <Text strong>{formatTime(selectedLog.timestamp)}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('applicationLogsPage.modal.level')}>
                                {getLevelTag(selectedLog.level)}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('applicationLogsPage.modal.module')}>
                                <Text strong>{selectedLog.module}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('applicationLogsPage.modal.id')}>
                                <Text strong>#{selectedLog.id}</Text>
                            </Descriptions.Item>
                        </Descriptions>

                        <Card
                            size="small"
                            title={t('applicationLogsPage.modal.detail')}
                            className="admin-card admin-card-subtle"
                        >
                            {/* eslint-disable-next-line admin-ui/no-admin-page-visual-utilities -- raw application log payload needs terminal-style monospace contrast */}
                            <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-50">
                                {selectedLog.message}
                            </pre>
                        </Card>
                    </div>
                )}
            </AppModal>
        </div>
    );
};

export default ApplicationLogs;
