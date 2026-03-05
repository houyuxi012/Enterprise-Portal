
import React, { useEffect, useState } from 'react';
import { Table, Tag, Select, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { SystemLog } from '@/types';
import AppButton from '@/components/AppButton';

const SystemLogs: React.FC = () => {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterLevel, setFilterLevel] = useState<string | undefined>(undefined);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getSystemLogs({ level: filterLevel });
            setLogs(data);
        } catch (error) {
            message.error(t('systemLogsPage.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [filterLevel]);

    const columns = [
        {
            title: t('systemLogsPage.table.time'),
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (text: string) => <span className="font-mono text-slate-500 font-medium text-xs">{text.substring(0, 19).replace('T', ' ')}</span>
        },
        {
            title: t('systemLogsPage.table.ipAddress'),
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 140,
            render: (text: string) => <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{text || t('systemLogsPage.table.emptyDash')}</span>
        },
        {
            title: t('systemLogsPage.table.method'),
            dataIndex: 'method',
            key: 'method',
            width: 100,
            render: (text: string) => <Tag className={`font-bold border-0 rounded-md ${text === 'GET' ? 'bg-blue-50 text-blue-600' : text === 'POST' ? 'bg-green-50 text-green-600' : 'bg-slate-100'}`}>{text}</Tag>
        },
        {
            title: t('systemLogsPage.table.requestPath'),
            dataIndex: 'request_path',
            key: 'request_path',
            render: (text: string) => <span className="font-mono text-xs text-slate-600 dark:text-slate-400 max-w-[200px] truncate block" title={text}>{text}</span>
        },
        {
            title: t('systemLogsPage.table.status'),
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
            title: t('systemLogsPage.table.duration'),
            dataIndex: 'response_time',
            key: 'response_time',
            width: 100,
            render: (time: number) => (
                <span className={`font-mono text-xs font-bold ${time > 1 ? 'text-red-500' : 'text-slate-500'}`}>
                    {time ? t('systemLogsPage.table.durationMs', { count: (time * 1000).toFixed(0) }) : t('systemLogsPage.table.emptyDash')}
                </span>
            )
        },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t('systemLogsPage.page.title')}</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">{t('systemLogsPage.page.subtitle')}</p>
                </div>
                <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={fetchLogs}>
                    {t('common.buttons.refresh')}
                </AppButton>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <div className="mb-6 bg-slate-50 dark:bg-slate-900 p-2 rounded-2xl border border-slate-100 dark:border-slate-700 inline-block">
                    <Select
                        placeholder={t('systemLogsPage.filters.levelPlaceholder')}
                        allowClear
                        variant="borderless"
                        style={{ width: 150 }}
                        onChange={setFilterLevel}
                        className="font-bold"
                        options={[
                            { value: 'INFO', label: <span className="text-blue-500 font-bold">{t('systemLogsPage.filters.info')}</span> },
                            { value: 'WARN', label: <span className="text-orange-500 font-bold">{t('systemLogsPage.filters.warn')}</span> },
                            { value: 'ERROR', label: <span className="text-rose-500 font-bold">{t('systemLogsPage.filters.error')}</span> },
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
                    locale={{ emptyText: t('systemLogsPage.table.empty') }}
                />
            </div>
        </div>
    );
};

export default SystemLogs;
