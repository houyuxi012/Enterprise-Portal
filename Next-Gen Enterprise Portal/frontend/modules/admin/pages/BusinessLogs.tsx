import React, { useEffect, useMemo, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Descriptions from 'antd/es/descriptions';
import Row from 'antd/es/grid/row';
import Space from 'antd/es/space';
import Statistic from 'antd/es/statistic';
import Tag from 'antd/es/tag';
import Tooltip from 'antd/es/tooltip';
import Typography from 'antd/es/typography';
import { ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, DatabaseOutlined, CloudOutlined, UserOutlined, AuditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import ApiClient from '@/services/api';
import { BusinessLog } from '@/types';
import { AppButton, AppDrawer, AppFilterBar, AppPageHeader, AppTable } from '@/modules/admin/components/ui';

const { Text } = Typography;

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

const getMeetingTargetKey = (target: string): string | null => {
  if (!target.startsWith('meeting:')) return null;
  const suffix = target.slice('meeting:'.length);
  if (suffix === 'list') return 'meeting_list';
  if (suffix === 'today-summary') return 'meeting_today_summary';
  if (suffix === 'today-list') return 'meeting_today_list';
  if (suffix) return 'meeting_record';
  return null;
};

const normalizeSourceParts = (source?: string): string[] => {
  const raw = String(source || 'db').replace(/\+/g, ',').toLowerCase();
  const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return parts.length > 0 ? [...new Set(parts)] : ['db'];
};

const BusinessLogs: React.FC = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
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

  const getTargetLabel = (target?: string) => {
    if (!target) return '-';
    const meetingTargetKey = getMeetingTargetKey(target);
    if (meetingTargetKey === 'meeting_record') {
      return t('businessLogs.targets.meeting_record', {
        id: target.slice('meeting:'.length),
        defaultValue: target,
      });
    }
    if (meetingTargetKey) {
      return t(`businessLogs.targets.${meetingTargetKey}`, { defaultValue: target });
    }
    return t(`businessLogs.targets.${toActionKey(target)}`, { defaultValue: target });
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
      message.error(t('businessLogs.messages.loadFailed', '加载业务日志失败'));
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
        <Text type="secondary">
          {text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'}
        </Text>
      ),
    },
    {
      title: t('businessLogs.table.operator'),
      dataIndex: 'operator',
      key: 'operator',
      width: 120,
      render: (text: string) => (
        <Space size="small">
          <UserOutlined />
          <Text>{text || '-'}</Text>
        </Space>
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
        <Tag>{getTargetLabel(text)}</Tag>
      ),
    },
    {
      title: t('businessLogs.table.ip'),
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 120,
      render: (text: string) => <Text code>{text || '-'}</Text>,
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
        const sources = normalizeSourceParts(source);
        if (sources.length > 1) {
          return (
            <Space size={[4, 4]} wrap>
              {sources.map((s, i) => (
                <Tag key={`${s}-${i}`} color={s === 'loki' ? 'purple' : 'cyan'} className="text-xs">
                  {s === 'loki' ? 'Loki' : 'DB'}
                </Tag>
              ))}
            </Space>
          );
        }
        return (
          <Tag color={sources[0] === 'loki' ? 'purple' : 'cyan'} className="text-xs">
            {sources[0] === 'loki' ? 'Loki' : 'DB'}
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
    <div className="admin-page admin-page-spaced">
      <AppPageHeader
        title={t('businessLogs.title')}
        subtitle={t('businessLogs.subtitle')}
        action={(
          <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
            {t('common.buttons.refresh')}
          </AppButton>
        )}
      />

      <Row gutter={16} className="mb-4">
        <Col span={6}>
          <Card className="admin-card">
            <Statistic
              title={t('businessLogs.stats.total')}
              value={stats.total}
              prefix={<AuditOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="admin-card">
            <Statistic
              title={t('businessLogs.stats.today')}
              value={stats.todayCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="admin-card">
            <Statistic
              title={t('businessLogs.stats.create')}
              value={stats.createCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="admin-card">
            <Statistic
              title={t('businessLogs.stats.modify')}
              value={stats.modifyCount}
              prefix={<AuditOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <AppFilterBar>
        <AppFilterBar.DateRange
          value={dateRange}
          onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
          placeholder={[t('businessLogs.filters.startTime'), t('businessLogs.filters.endTime')]}
        />
        <AppFilterBar.Select
          placeholder={t('businessLogs.filters.action')}
          value={actionFilter}
          onChange={setActionFilter}
          width={160}
          options={actionOptions}
        />
        <AppFilterBar.Select
          placeholder={t('businessLogs.filters.status')}
          value={statusFilter}
          onChange={setStatusFilter}
          width={112}
          options={[
            { value: 'SUCCESS', label: t('common.status.success') },
            { value: 'FAIL', label: t('common.status.fail') },
          ]}
        />
        <AppFilterBar.Select
          value={sourceFilter}
          onChange={setSourceFilter}
          width={128}
          allowClear={false}
          options={[
            { value: 'db', label: <span className="flex items-center gap-1"><DatabaseOutlined />DB</span> },
            { value: 'loki', label: <span className="flex items-center gap-1"><CloudOutlined />Loki</span> },
            { value: 'all', label: t('common.status.all') },
          ]}
        />
        <AppFilterBar.Action>
          <AppButton intent="primary" onClick={() => { void fetchLogs(); }} loading={loading}>
            {t('common.buttons.query')}
          </AppButton>
        </AppFilterBar.Action>
      </AppFilterBar>

      <Card className="admin-card">
        <AppTable<BusinessLog>
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1100 }}
          locale={{ emptyText: t('businessLogs.empty') }}
        />
      </Card>

      <AppDrawer
        title={t('businessLogs.drawer.title')}
        width={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        hideFooter
      >
        {selectedLog && (
          <div className="space-y-6">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label={t('businessLogs.drawer.logId')}>
                <Text code>{selectedLog.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.time')}>
                <Text>{selectedLog.timestamp ? dayjs(selectedLog.timestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.operator')}>
                <Text>{selectedLog.operator || '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.action')}>
                <Tag color="blue">{getActionLabel(selectedLog.action)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.target')}>
                <Text code>{getTargetLabel(selectedLog.target)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('businessLogs.drawer.ip')}>
                <Text>{selectedLog.ip_address || '-'}</Text>
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
                  {/* eslint-disable-next-line admin-ui/no-admin-page-visual-utilities -- raw business log detail needs preserved plaintext preview styling */}
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">
                    {selectedLog.detail}
                  </pre>
                </Descriptions.Item>
              )}
            </Descriptions>
          </div>
        )}
      </AppDrawer>
    </div>
  );
};

export default BusinessLogs;
