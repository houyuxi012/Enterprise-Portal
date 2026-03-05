
import React, { useEffect, useState } from 'react';
import { Table, Tag, Select, message, Modal } from 'antd';
import { ReloadOutlined, BugOutlined, ExclamationCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { SystemLog } from '@/types';
import AppButton from '@/components/AppButton';

const { Option } = Select;

const ApplicationLogs: React.FC = () => {
    const { t, i18n } = useTranslation();
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
        fetchLogs();
    }, [level]);

    const formatTime = (value: string) => {
        const locale = i18n.resolvedLanguage?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
        return new Date(value).toLocaleString(locale);
    };

    const handleViewDetail = (log: SystemLog) => {
        setSelectedLog(log);
        setIsModalOpen(true);
    };

    const columns = [
        {
            title: t('applicationLogsPage.table.time'),
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (text: string) => <span className="font-mono text-xs text-slate-500">{formatTime(text)}</span>
        },
        {
            title: t('applicationLogsPage.table.level'),
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
            title: t('applicationLogsPage.table.module'),
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
            title: t('applicationLogsPage.table.message'),
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
            title: t('applicationLogsPage.table.actions'),
            key: 'action',
            width: 100,
            render: (_: any, record: SystemLog) => (
                <AppButton intent="tertiary" size="sm" onClick={() => handleViewDetail(record)}>{t('common.buttons.detail')}</AppButton>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t('applicationLogsPage.page.title')}</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">{t('applicationLogsPage.page.subtitle')}</p>
                </div>
                <div className="flex gap-3">
                    <Select
                        placeholder={t('applicationLogsPage.filters.levelPlaceholder')}
                        allowClear
                        className="w-40"
                        onChange={(value) => setLevel(value)}
                    >
                        <Option value="INFO">{t('applicationLogsPage.filters.info')}</Option>
                        <Option value="WARN">{t('applicationLogsPage.filters.warn')}</Option>
                        <Option value="ERROR">{t('applicationLogsPage.filters.error')}</Option>
                    </Select>
                    <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>{t('common.buttons.refresh')}</AppButton>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <Table
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    className="ant-table-custom"
                    locale={{ emptyText: t('applicationLogsPage.table.empty') }}
                    pagination={{ pageSize: 20 }}
                />
            </div>

            {/* Detail Modal */}
            <Modal
                title={
                    <div className="flex items-center space-x-2">
                        <BugOutlined className="text-slate-400" />
                        <span>{t('applicationLogsPage.modal.title')}</span>
                    </div>
                }
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={[<AppButton key="close" intent="secondary" onClick={() => setIsModalOpen(false)}>{t('applicationLogsPage.modal.close')}</AppButton>]}
                width={800}
                className="rounded-2xl"
            >
                {selectedLog && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-xs font-mono border border-slate-100">
                            <div>
                                <span className="text-slate-400 block mb-1">{t('applicationLogsPage.modal.time')}</span>
                                <span className="font-bold text-slate-700">{formatTime(selectedLog.timestamp)}</span>
                            </div>
                            <div>
                                <span className="text-slate-400 block mb-1">{t('applicationLogsPage.modal.level')}</span>
                                <Tag color={selectedLog.level === 'ERROR' ? 'red' : 'blue'}>{selectedLog.level}</Tag>
                            </div>
                            <div>
                                <span className="text-slate-400 block mb-1">{t('applicationLogsPage.modal.module')}</span>
                                <span className="font-bold text-slate-700">{selectedLog.module}</span>
                            </div>
                            <div>
                                <span className="text-slate-400 block mb-1">{t('applicationLogsPage.modal.id')}</span>
                                <span className="font-bold text-slate-700">#{selectedLog.id}</span>
                            </div>
                        </div>

                        <div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">{t('applicationLogsPage.modal.detail')}</span>
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
