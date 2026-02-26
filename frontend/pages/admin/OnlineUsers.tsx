import React, { useEffect, useMemo, useState } from 'react';
import { App, Avatar, Card, Input, Select, Space } from 'antd';
import { DisconnectOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { OnlineUserSession } from '../../types';
import ApiClient from '../../services/api';
import { AppButton, AppPageHeader, AppTable, AppTag } from '../../components/admin';

const formatDateTime = (value?: string | null): string => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('zh-CN', { hour12: false });
};

const OnlineUsers: React.FC = () => {
  const { message, modal } = App.useApp();
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
      message.error('加载在线用户失败');
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
      title: `确定将用户 ${record.username} 退出全部设备吗？`,
      content: '该操作会立即使该用户所有在线会话失效。',
      okText: '确认踢下线',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await ApiClient.kickUserSessions(record.user_id, 'all');
          message.success(`已踢下线，失效会话 ${result.revoked_sessions} 个`);
          await fetchData();
        } catch (error: any) {
          message.error(error?.response?.data?.detail || '踢下线失败');
        }
      },
    });
  };

  const handleBatchKick = () => {
    if (selectedRowKeys.length === 0) return;
    modal.confirm({
      title: `确定将选中的 ${selectedRowKeys.length} 位用户退出全部设备吗？`,
      content: '该操作会立即使所选用户全部在线会话失效。',
      okText: '确认踢下线',
      cancelText: '取消',
      onOk: async () => {
        setKicking(true);
        const hide = message.loading('正在执行踢下线...', 0);
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
            message.success(`批量踢下线成功，累计失效会话 ${revokedTotal} 个`);
          } else {
            message.warning(`批量踢下线完成：成功 ${success.length}，失败 ${failed}`);
          }
          setSelectedRowKeys([]);
          await fetchData();
        } catch (error) {
          message.error('批量踢下线失败');
        } finally {
          hide();
          setKicking(false);
        }
      },
    });
  };

  const columns: ColumnsType<OnlineUserSession> = [
    {
      title: '用户',
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
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (value: string | null | undefined) => value || '-',
    },
    {
      title: 'Portal 会话',
      dataIndex: 'portal_sessions',
      key: 'portal_sessions',
      width: 120,
    },
    {
      title: 'Admin 会话',
      dataIndex: 'admin_sessions',
      key: 'admin_sessions',
      width: 120,
    },
    {
      title: '总会话数',
      dataIndex: 'total_sessions',
      key: 'total_sessions',
      width: 100,
      render: (value: number) => <span className="font-semibold text-slate-700">{value}</span>,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (value: boolean) => (
        <AppTag status={value ? 'success' : 'default'}>{value ? '启用' : '禁用'}</AppTag>
      ),
    },
    {
      title: '最晚过期',
      dataIndex: 'latest_exp_at',
      key: 'latest_exp_at',
      width: 190,
      render: (value: string | null | undefined) => formatDateTime(value),
    },
    {
      title: '操作',
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
          退出全部设备
        </AppButton>
      ),
    },
  ];

  return (
    <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
      <AppPageHeader
        title="在线用户"
        subtitle="查看当前在线会话并支持强制下线"
        action={
          <Space>
            <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={fetchData}>
              刷新
            </AppButton>
          </Space>
        }
      />

      <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] mb-4 p-1" styles={{ body: { padding: '12px 16px' } }}>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="搜索姓名、账号或邮箱"
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
                { label: '全部会话', value: 'all' },
                { label: 'Portal 会话', value: 'portal' },
                { label: 'Admin 会话', value: 'admin' },
              ]}
            />
          </Space>

          {selectedRowKeys.length > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
              <span className="text-sm text-slate-500 font-medium mr-2">
                已选 {selectedRowKeys.length} 项
              </span>
              <AppButton
                intent="danger"
                size="sm"
                icon={<DisconnectOutlined />}
                loading={kicking}
                onClick={handleBatchKick}
              >
                退出全部设备/踢下线
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
          emptyText="当前没有在线用户"
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
