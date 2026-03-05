import React, { useEffect, useMemo, useState } from 'react';
import { Table, Tag, Select, Drawer, Descriptions, Statistic, Card, Row, Col, DatePicker, Tooltip } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, DatabaseOutlined, CloudOutlined, UserOutlined, AuditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import ApiClient from '@/services/api';
import { BusinessLog } from '@/types';
import AppButton from '@/components/AppButton';

interface LogStats {
  total: number;
  todayCount: number;
  createCount: number;
  modifyCount: number;
}

const ACTION_CATEGORIES: Record<string, { key: string; color: string }> = {
  LOGIN: { key: 'login', color: 'cyan' },
  CREATE: { key: 'create', color: 'green' },
  UPDATE: { key: 'update', color: 'blue' },
  DELETE: { key: 'delete', color: 'red' },
  REINDEX: { key: 'reindex', color: 'purple' },
  OTHER: { key: 'other', color: 'default' },
};

const getActionCategory = (action: string): { key: string; color: string } => {
  const normalized = (action || '').toUpperCase();
  if (normalized === 'LOGIN') return ACTION_CATEGORIES.LOGIN;
  if (normalized.includes('CREATE')) return ACTION_CATEGORIES.CREATE;
  if (normalized.includes('UPDATE')) return ACTION_CATEGORIES.UPDATE;
  if (normalized.includes('DELETE')) return ACTION_CATEGORIES.DELETE;
  if (normalized.includes('REINDEX')) return ACTION_CATEGORIES.REINDEX;
  return ACTION_CATEGORIES.OTHER;
};

const toActionKey = (action?: string): string => {
  return String(action || '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
};

const BusinessLogs: React.FC = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<BusinessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<LogStats>({ total: 0, todayCount: 0, createCount: 0, modifyCount: 0 });
  const [selectedLog, setSelectedLog] = useState<BusinessLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const getActionLabel = (action?: string) => {
    const key = toActionKey(action);
    return t(`businessLogs.actions.${key}`, { defaultValue: action || '-' });
  };

  const getStatusLabel = (status?: string) => {
    if (status === 'SUCCESS') return t('common.status.success');
    if (status === 'FAIL') return t('common.status.fail');
    return t('common.status.unknown');
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getBusinessLogs({
        action: actionFilter,
        source: sourceFilter,
      });
      setLogs(data);

      const today = dayjs().format('YYYY-MM-DD');
      const todayLogs = data.filter((log: BusinessLog) => log.timestamp?.startsWith(today));
      const createLogs = data.filter((log: BusinessLog) => (log.action || '').toUpperCase().includes('CREATE'));
      const modifyLogs = data.filter((log: BusinessLog) =>
        (log.action || '').toUpperCase().includes('UPDATE') ||
        (log.action || '').toUpperCase().includes('DELETE')
      );
      setStats({
        total: data.length,
        todayCount: todayLogs.length,
        createCount: createLogs.length,
        modifyCount: modifyLogs.length,
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, [sourceFilter]);

  const handleViewDetail = (record: BusinessLog) => {
    setSelectedLog(record);
    setDrawerOpen(true);
  };

  const columns = useMemo(() => ([
    {
      title: t('businessLogs.table.time'),
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (text: string) => (
        <span className="text-xs text-slate-500">
          {text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'}
        </span>
      ),
    },
    {
      title: t('businessLogs.table.operator'),
      dataIndex: 'operator',
      key: 'operator',
      width: 120,
      render: (text: string) => (
        <div className="flex items-center gap-2">
          <UserOutlined className="text-indigo-500" />
          <span className="font-medium text-slate-700">{text || '-'}</span>
        </div>
      ),
    },
    {
      title: t('businessLogs.table.action'),
      dataIndex: 'action',
      key: 'action',
      width: 180,
      render: (text: string) => {
        const category = getActionCategory(text);
        return (
          <Tooltip title={text}>
            <Tag color={category.color} icon={<AuditOutlined />}>
              {getActionLabel(text)}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: t('businessLogs.table.target'),
      dataIndex: 'target',
      key: 'target',
      width: 150,
      render: (text: string) => (
        <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600">
          {text || '-'}
        </span>
      ),
    },
    {
      title: t('businessLogs.table.ip'),
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 120,
      render: (text: string) => (
        <span className="font-mono text-xs text-slate-400">{text || '-'}</span>
      ),
    },
    {
      title: t('businessLogs.table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => (
        <Tag
          color={status === 'SUCCESS' ? 'green' : 'red'}
          icon={status === 'SUCCESS' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        >
          {getStatusLabel(status)}
        </Tag>
      ),
    },
    {
      title: t('businessLogs.table.source'),
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (source: string) => {
        if (source?.includes(',')) {
          const sources = source.split(',');
          return (
            <span className="flex gap-1">
              {sources.map((s, i) => (
                <Tag key={`${s}-${i}`} color={s.trim() === 'LOKI' ? 'purple' : 'cyan'} className="text-xs">
                  {s.trim()}
                </Tag>
              ))}
            </span>
          );
        }
        return (
          <Tag color={source === 'LOKI' ? 'purple' : 'cyan'} className="text-xs">
            {source || 'DB'}
          </Tag>
        );
      },
    },
    {
      title: t('businessLogs.table.actions'),
      key: 'actions',
      width: 80,
      render: (_: unknown, record: BusinessLog) => (
        <AppButton intent="tertiary" size="sm" onClick={() => handleViewDetail(record)}>
          {t('common.buttons.detail')}
        </AppButton>
      ),
    },
  ]), [t]);

  const actionOptions = useMemo(
    () => [...new Set(logs.map((log) => log.action))].map((action) => ({
      value: action,
      label: getActionLabel(action),
    })),
    [logs, t]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t('businessLogs.title')}</h2>
          <p className="text-xs text-slate-400 font-bold mt-1">{t('businessLogs.subtitle')}</p>
        </div>
        <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
          {t('common.buttons.refresh')}
        </AppButton>
      </div>

      <Row gutter={16} className="mb-4">
        <Col span={6}>
          <Card className="rounded-2xl shadow-sm">
            <Statistic
              title={t('businessLogs.stats.total')}
              value={stats.total}
              prefix={<AuditOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="rounded-2xl shadow-sm">
            <Statistic
              title={t('businessLogs.stats.today')}
              value={stats.todayCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="rounded-2xl shadow-sm">
            <Statistic
              title={t('businessLogs.stats.create')}
              value={stats.createCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="rounded-2xl shadow-sm">
            <Statistic
              title={t('businessLogs.stats.modify')}
              value={stats.modifyCount}
              prefix={<AuditOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 flex flex-wrap gap-4 items-center">
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
          className="rounded-xl"
          placeholder={[t('businessLogs.filters.startTime'), t('businessLogs.filters.endTime')]}
        />
        <Select
          placeholder={t('businessLogs.filters.action')}
          allowClear
          value={actionFilter}
          onChange={setActionFilter}
          className="w-40"
          options={actionOptions}
        />
        <Select
          placeholder={t('businessLogs.filters.status')}
          allowClear
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-28"
          options={[
            { value: 'SUCCESS', label: t('common.status.success') },
            { value: 'FAIL', label: t('common.status.fail') },
          ]}
        />
        <Select
          value={sourceFilter}
          onChange={setSourceFilter}
          className="w-28"
          options={[
            { value: 'db', label: <span className="flex items-center gap-1"><DatabaseOutlined />DB</span> },
            { value: 'loki', label: <span className="flex items-center gap-1"><CloudOutlined />Loki</span> },
            { value: 'all', label: t('common.status.all') },
          ]}
        />
        <AppButton intent="primary" onClick={fetchLogs} loading={loading}>
          {t('common.buttons.query')}
        </AppButton>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1100 }}
          locale={{ emptyText: t('businessLogs.empty') }}
          className="ant-table-custom"
        />
      </div>

      <Drawer
        title={t('businessLogs.drawer.title')}
        width={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {selectedLog && (
          <div className="space-y-6">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label={t('businessLogs.drawer.logId')}>
                <code className="text-xs">{selectedLog.id}</code>
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.time')}>
                {selectedLog.timestamp ? dayjs(selectedLog.timestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.operator')}>
                {selectedLog.operator || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.action')}>
                <Tag color="blue">{getActionLabel(selectedLog.action)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.target')}>
                <code className="text-xs">{selectedLog.target || '-'}</code>
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.ip')}>
                {selectedLog.ip_address || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.status')}>
                <Tag color={selectedLog.status === 'SUCCESS' ? 'green' : 'red'}>
                  {getStatusLabel(selectedLog.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.source')}>
                <Tag color="purple">{selectedLog.source || 'DB'}</Tag>
              </Descriptions.Item>
              {selectedLog.detail && (
                <Descriptions.Item label={t('businessLogs.drawer.detail')}>
                  <pre className="text-xs bg-slate-50 p-3 rounded-lg whitespace-pre-wrap max-h-48 overflow-auto">
                    {selectedLog.detail}
                  </pre>
                </Descriptions.Item>
              )}
            </Descriptions>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default BusinessLogs;
