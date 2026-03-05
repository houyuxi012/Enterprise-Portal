import React, { useEffect, useMemo, useState } from 'react';
import { App, Avatar, Card, Input, Select, Space } from 'antd';
import { DisconnectOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { OnlineUserSession } from '@/types';
import ApiClient from '@/services/api';
import { AppButton, AppPageHeader, AppTable, AppTag } from '@/components/admin';

const formatDateTime = (value?: string | null, locale: string = 'en-US'): string => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString(locale, { hour12: false });
};

const OnlineUsers: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { message, modal } = App.useApp();
  const dateLocale = i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-US';
  const [loading, setLoading] = useState(false);
  const [audienceScope, setAudienceScope] = useState<'admin' | 'portal' | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  const [rows, setRows] = useState<OnlineUserSession[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [kicking, setKicking] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getOnlineUsers({
        audience_scope: audienceScope,
        keyword: searchText.trim() || undefined,
      });
      setRows(data);
    } catch (error) {
      console.error(error);
      message.error(t('onlineUsers.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceScope]);

  const filteredRows = useMemo(() => {
    if (!searchText.trim()) return rows;
    const keyword = searchText.trim().toLowerCase();
    return rows.filter((item) => {
      const haystack = `${item.username} ${item.name || ''} ${item.email || ''}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [rows, searchText]);

  const handleKickOne = (record: OnlineUserSession) => {
    modal.confirm({
      title: t('onlineUsers.confirm.singleTitle', { username: record.username }),
      content: t('onlineUsers.confirm.singleContent'),
      okText: t('onlineUsers.confirm.ok'),
      cancelText: t('onlineUsers.confirm.cancel'),
      onOk: async () => {
        try {
          const result = await ApiClient.kickUserSessions(record.user_id, 'all');
          message.success(t('onlineUsers.messages.singleKickSuccess', { count: result.revoked_sessions }));
          await fetchData();
        } catch (error: any) {
          message.error(error?.response?.data?.detail || t('onlineUsers.messages.singleKickFailed'));
        }
      },
    });
  };

  const handleBatchKick = () => {
    if (selectedRowKeys.length === 0) return;
    modal.confirm({
      title: t('onlineUsers.confirm.batchTitle', { count: selectedRowKeys.length }),
      content: t('onlineUsers.confirm.batchContent'),
      okText: t('onlineUsers.confirm.ok'),
      cancelText: t('onlineUsers.confirm.cancel'),
      onOk: async () => {
        setKicking(true);
        const hide = message.loading(t('onlineUsers.messages.batchKicking'), 0);
        try {
          const targetRows = filteredRows.filter((row) => selectedRowKeys.includes(row.user_id));
          const settled = await Promise.allSettled(
            targetRows.map((row) => ApiClient.kickUserSessions(row.user_id, 'all'))
          );
          const success = settled.filter((item) => item.status === 'fulfilled') as PromiseFulfilledResult<any>[];
          const failed = settled.length - success.length;
          const revokedTotal = success.reduce(
            (sum, item) => sum + Number(item.value?.revoked_sessions || 0),
            0
          );

          if (failed === 0) {
            message.success(t('onlineUsers.messages.batchKickSuccess', { count: revokedTotal }));
          } else {
            message.warning(t('onlineUsers.messages.batchKickPartial', { success: success.length, failed }));
          }
          setSelectedRowKeys([]);
          await fetchData();
        } catch (error) {
          message.error(t('onlineUsers.messages.batchKickFailed'));
        } finally {
          hide();
          setKicking(false);
        }
      },
    });
  };

  const columns: ColumnsType<OnlineUserSession> = [
    {
      title: t('onlineUsers.table.user'),
      dataIndex: 'username',
      key: 'username',
      render: (_value: string, record: OnlineUserSession) => (
        <div className="flex items-center gap-3">
          <Avatar
            src={record.avatar || undefined}
            icon={<UserOutlined />}
            size={36}
            className="border border-slate-200"
          />
          <div className="min-w-0">
            <div className="font-medium text-slate-800 truncate">{record.name || record.username}</div>
            <div className="text-xs text-slate-500 font-mono truncate">{record.username}</div>
          </div>
        </div>
      ),
    },
    {
      title: t('onlineUsers.table.email'),
      dataIndex: 'email',
      key: 'email',
      render: (value: string | null | undefined) => value || '-',
    },
    {
      title: t('onlineUsers.table.portalSessions'),
      dataIndex: 'portal_sessions',
      key: 'portal_sessions',
      width: 120,
    },
    {
      title: t('onlineUsers.table.adminSessions'),
      dataIndex: 'admin_sessions',
      key: 'admin_sessions',
      width: 120,
    },
    {
      title: t('onlineUsers.table.totalSessions'),
      dataIndex: 'total_sessions',
      key: 'total_sessions',
      width: 100,
      render: (value: number) => <span className="font-semibold text-slate-700">{value}</span>,
    },
    {
      title: t('onlineUsers.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (value: boolean) => (
        <AppTag status={value ? 'success' : 'default'}>{value ? t('onlineUsers.status.enabled') : t('onlineUsers.status.disabled')}</AppTag>
      ),
    },
    {
      title: t('onlineUsers.table.latestExpire'),
      dataIndex: 'latest_exp_at',
      key: 'latest_exp_at',
      width: 190,
      render: (value: string | null | undefined) => formatDateTime(value, dateLocale),
    },
    {
      title: t('onlineUsers.table.actions'),
      key: 'action',
      align: 'right',
      width: 180,
      render: (_: unknown, record: OnlineUserSession) => (
        <AppButton
          intent="secondary"
          size="sm"
          icon={<DisconnectOutlined />}
          onClick={() => handleKickOne(record)}
        >
          {t('onlineUsers.table.kickAll')}
        </AppButton>
      ),
    },
  ];

  return (
    <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
      <AppPageHeader
        title={t('onlineUsers.page.title')}
        subtitle={t('onlineUsers.page.subtitle')}
        action={
          <Space>
            <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={fetchData}>
              {t('common.buttons.refresh')}
            </AppButton>
          </Space>
        }
      />

      <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] mb-4 p-1" styles={{ body: { padding: '12px 16px' } }}>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <Space wrap>
            <Input.Search
              allowClear
              placeholder={t('onlineUsers.filters.searchPlaceholder')}
              style={{ width: 320 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={() => void fetchData()}
            />
            <Select
              value={audienceScope}
              style={{ width: 180 }}
              onChange={(value) => setAudienceScope(value)}
              options={[
                { label: t('onlineUsers.filters.allSessions'), value: 'all' },
                { label: t('onlineUsers.filters.portalSessions'), value: 'portal' },
                { label: t('onlineUsers.filters.adminSessions'), value: 'admin' },
              ]}
            />
          </Space>

          {selectedRowKeys.length > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
              <span className="text-sm text-slate-500 font-medium mr-2">
                {t('onlineUsers.batch.selected', { count: selectedRowKeys.length })}
              </span>
              <AppButton
                intent="danger"
                size="sm"
                icon={<DisconnectOutlined />}
                loading={kicking}
                onClick={handleBatchKick}
              >
                {t('onlineUsers.batch.kickButton')}
              </AppButton>
            </div>
          )}
        </div>
      </Card>

      <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
        <AppTable
          rowKey="user_id"
          loading={loading}
          columns={columns}
          dataSource={filteredRows}
          pageSize={10}
          emptyText={t('onlineUsers.table.empty')}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
        />
      </Card>
    </div>
  );
};

export default OnlineUsers;
