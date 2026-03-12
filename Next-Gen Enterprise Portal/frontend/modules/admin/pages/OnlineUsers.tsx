import React, { useEffect, useMemo, useState } from 'react';
import App from 'antd/es/app';
import Avatar from 'antd/es/avatar';
import Card from 'antd/es/card';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import { DisconnectOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { OnlineUserSession, SessionRevokeResult } from '@/types';
import ApiClient from '@/services/api';
import { AppButton, AppFilterBar, AppPageHeader, AppTable, AppTag } from '@/modules/admin/components/ui';

type ApiErrorShape = {
  response?: {
    data?: {
      detail?: { message?: string } | string;
    };
  };
};

const formatDateTime = (value?: string | null, locale: string = 'en-US'): string => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString(locale, { hour12: false });
};

const resolveApiErrorMessage = (error: unknown, fallback: string): string => {
  const detail = (error as ApiErrorShape)?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object' && typeof detail.message === 'string' && detail.message.trim()) return detail.message;
  return fallback;
};

const { Text } = Typography;

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
        } catch (error: unknown) {
          message.error(resolveApiErrorMessage(error, t('onlineUsers.messages.singleKickFailed')));
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
          const success = settled.filter((item) => item.status === 'fulfilled') as PromiseFulfilledResult<SessionRevokeResult>[];
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
        <Space align="center" size={12}>
          <Avatar
            src={record.avatar || undefined}
            icon={<UserOutlined />}
            size={36}
          />
          <div className="min-w-0">
            <Text strong ellipsis style={{ display: 'block', maxWidth: 220 }}>
              {record.name || record.username}
            </Text>
            <Text type="secondary" code ellipsis style={{ display: 'block', maxWidth: 220 }}>
              {record.username}
            </Text>
          </div>
        </Space>
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
      render: (value: number) => <Text strong>{value}</Text>,
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
    <div className="admin-page admin-page-spaced">
      <AppPageHeader
        title={t('onlineUsers.page.title')}
        subtitle={t('onlineUsers.page.subtitle')}
        action={
          <Space>
            <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={() => void fetchData()}>
              {t('common.buttons.refresh')}
            </AppButton>
          </Space>
        }
      />

      <AppFilterBar>
        <AppFilterBar.Search
          placeholder={t('onlineUsers.filters.searchPlaceholder')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={setSearchText}
          style={{ width: 320 }}
        />
        <AppFilterBar.Select
          value={audienceScope}
          width={180}
          allowClear={false}
          onChange={(value) => setAudienceScope(value)}
          options={[
            { label: t('onlineUsers.filters.allSessions'), value: 'all' },
            { label: t('onlineUsers.filters.portalSessions'), value: 'portal' },
            { label: t('onlineUsers.filters.adminSessions'), value: 'admin' },
          ]}
        />
        <AppFilterBar.Action>
          <Space size={12}>
            {selectedRowKeys.length > 0 && (
              <Text type="secondary">
                {t('onlineUsers.batch.selected', { count: selectedRowKeys.length })}
              </Text>
            )}
            {selectedRowKeys.length > 0 && (
              <AppButton
                intent="danger"
                size="sm"
                icon={<DisconnectOutlined />}
                loading={kicking}
                onClick={handleBatchKick}
              >
                {t('onlineUsers.batch.kickButton')}
              </AppButton>
            )}
          </Space>
        </AppFilterBar.Action>
      </AppFilterBar>

      <Card className="admin-card overflow-hidden">
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
