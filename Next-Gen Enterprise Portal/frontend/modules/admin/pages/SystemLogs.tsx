
import React, { useEffect, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { SystemLog } from '@/types';
import { AppButton, AppFilterBar, AppPageHeader, AppTable } from '@/modules/admin/components/ui';

const { Text } = Typography;

const SystemLogs: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
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
            render: (text: string) => (
                <Text code type="secondary">
                    {text.substring(0, 19).replace('T', ' ')}
                </Text>
            ),
        },
        {
            title: t('systemLogsPage.table.ipAddress'),
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 140,
            render: (text: string) => <Text code>{text || t('systemLogsPage.table.emptyDash')}</Text>,
        },
        {
            title: t('systemLogsPage.table.method'),
            dataIndex: 'method',
            key: 'method',
            width: 100,
            render: (text: string) => {
                const method = String(text || '').toUpperCase();
                const color = method === 'GET' ? 'blue' : method === 'POST' ? 'green' : 'default';
                return <Tag color={color}>{method || t('systemLogsPage.table.emptyDash')}</Tag>;
            },
        },
        {
            title: t('systemLogsPage.table.requestPath'),
            dataIndex: 'request_path',
            key: 'request_path',
            render: (text: string) => (
                <Text code ellipsis={{ tooltip: text }} style={{ maxWidth: 260, display: 'block' }}>
                    {text}
                </Text>
            ),
        },
        {
            title: t('systemLogsPage.table.status'),
            dataIndex: 'status_code',
            key: 'status_code',
            width: 80,
            render: (code: number) => {
                let color = 'green';
                if (code >= 300) color = 'blue';
                if (code >= 400) color = 'orange';
                if (code >= 500) color = 'red';
                return <Tag color={color}>{code}</Tag>;
            },
        },
        {
            title: t('systemLogsPage.table.duration'),
            dataIndex: 'response_time',
            key: 'response_time',
            width: 100,
            render: (time: number) => {
                if (!time) {
                    return <Text type="secondary">{t('systemLogsPage.table.emptyDash')}</Text>;
                }
                const duration = t('systemLogsPage.table.durationMs', { count: Math.round(time * 1000) });
                return <Text type={time > 1 ? 'danger' : 'secondary'}>{duration}</Text>;
            },
        },
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('systemLogsPage.page.title')}
                subtitle={t('systemLogsPage.page.subtitle')}
                action={(
                    <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={() => void fetchLogs()}>
                        {t('common.buttons.refresh')}
                    </AppButton>
                )}
            />

            <AppFilterBar>
                <AppFilterBar.Select
                    placeholder={t('systemLogsPage.filters.levelPlaceholder')}
                    value={filterLevel}
                    allowClear
                    width={180}
                    onChange={(value) => setFilterLevel(value)}
                    options={[
                        { value: 'INFO', label: t('systemLogsPage.filters.info') },
                        { value: 'WARN', label: t('systemLogsPage.filters.warn') },
                        { value: 'ERROR', label: t('systemLogsPage.filters.error') },
                    ]}
                />
            </AppFilterBar>

            <Card className="admin-card">
                <AppTable
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pageSize={20}
                    emptyText={t('systemLogsPage.table.empty')}
                />
            </Card>
        </div>
    );
};

export default SystemLogs;
