import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Col, Empty, Input, List, Row, Select, Switch, Tag, Typography, message } from 'antd';
import { LinkOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { AppButton, AppPageHeader } from '@/modules/admin/components/ui';

const { Paragraph, Text, Title } = Typography;

const STORAGE_KEY = 'admin-meeting-sync-draft';
const providerCards = ['tencent', 'feishu', 'dingtalk', 'zoom', 'teams'] as const;

type ProviderKey = (typeof providerCards)[number];
type SyncMode = 'manual' | 'scheduled' | 'webhook';
type SyncScope = 'meetings' | 'meetings_rooms' | 'full';
type RoomMapping = 'name' | 'external_id' | 'hybrid';

interface SyncDraft {
  provider: ProviderKey;
  enabled: boolean;
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  syncMode: SyncMode;
  syncScope: SyncScope;
  syncCron: string;
  roomMapping: RoomMapping;
}

const defaultDraft: SyncDraft = {
  provider: 'tencent',
  enabled: false,
  apiBaseUrl: '',
  clientId: '',
  clientSecret: '',
  syncMode: 'manual',
  syncScope: 'meetings',
  syncCron: '0 */2 * * *',
  roomMapping: 'name',
};

const MeetingThirdPartySync: React.FC = () => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SyncDraft>(defaultDraft);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<SyncDraft>;
      setDraft((current) => ({ ...current, ...parsed }));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const handleDraftChange = <K extends keyof SyncDraft>(key: K, value: SyncDraft[K]): void => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSaveDraft = (): void => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    message.success(t('meetingSync.messages.saveSuccess', '同步配置草稿已保存'));
  };

  const handleTestConnection = (): void => {
    message.info(t('meetingSync.messages.testPlaceholder', '测试连接入口已预留，后续会接入真实联通性检查。'));
  };

  const taskPlaceholders = useMemo(() => {
    const providerLabel = t(`meetingSync.providers.${draft.provider}`, draft.provider);
    return [
      {
        key: 'bootstrap',
        title: t('meetingSync.tasks.bootstrap.title', '配置平台凭据'),
        status: draft.clientId && draft.clientSecret ? 'ready' : 'pending',
        description: t(
          'meetingSync.tasks.bootstrap.description',
          '填写平台地址、应用 ID 与密钥后，才可以进入后续同步联调。',
        ),
      },
      {
        key: 'rooms',
        title: t('meetingSync.tasks.rooms.title', '会议室映射校验'),
        status: draft.roomMapping === 'hybrid' ? 'planning' : 'pending',
        description: t(
          'meetingSync.tasks.rooms.description',
          '确定本地会议室与外部平台房间的映射策略，避免同步后产生重复会议室。',
        ),
      },
      {
        key: 'jobs',
        title: t('meetingSync.tasks.jobs.title', '同步任务接入'),
        status: draft.enabled ? 'planning' : 'pending',
        description: t(
          'meetingSync.tasks.jobs.description',
          '当前先展示任务占位。后续会在这里接入定时任务、Webhook 回流和失败重试。',
        ),
      },
      {
        key: 'provider',
        title: t('meetingSync.tasks.provider.title', '当前平台'),
        status: 'ready',
        description: t('meetingSync.tasks.provider.description', '已选择 {{provider}} 作为当前接入平台。', {
          provider: providerLabel,
        }),
      },
    ] as const;
  }, [draft.clientId, draft.clientSecret, draft.enabled, draft.provider, draft.roomMapping, t]);

  const getTaskTagColor = (status: string): string => {
    switch (status) {
      case 'ready':
        return 'success';
      case 'planning':
        return 'processing';
      default:
        return 'default';
    }
  };

  const getTaskStatusLabel = (status: string): string => {
    switch (status) {
      case 'ready':
        return t('meetingSync.taskStatus.ready', '已就绪');
      case 'planning':
        return t('meetingSync.taskStatus.planning', '规划中');
      default:
        return t('meetingSync.taskStatus.pending', '待完成');
    }
  };

  return (
    <div className="space-y-6">
      <AppPageHeader
        title={t('meetingSync.page.title', '会议管理 / 三方同步')}
        subtitle={t('meetingSync.page.subtitle', '用于对接外部会议平台、同步会议信息和会议室资源。当前入口先预留。')}
        action={(
          <div className="flex items-center gap-3">
            <AppButton intent="secondary" icon={<LinkOutlined />} onClick={handleTestConnection}>
              {t('meetingSync.actions.testConnection', '测试连接')}
            </AppButton>
            <AppButton intent="primary" icon={<SyncOutlined />} onClick={handleSaveDraft}>
              {t('meetingSync.actions.saveDraft', '保存草稿')}
            </AppButton>
          </div>
        )}
      />

      <Alert
        type="info"
        showIcon
        icon={<SyncOutlined />}
        message={t('meetingSync.status.title', '待开发')}
        description={t(
          'meetingSync.status.description',
          '当前页面提供平台配置和任务占位，用于收口接入参数。后续会继续接真实凭据存储、任务调度和同步审计。',
        )}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card className="border-0 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <Title level={5} className="!mb-2">
                  {t('meetingSync.sections.config', '平台配置')}
                </Title>
                <Paragraph className="!mb-0 text-slate-500">
                  {t('meetingSync.sections.configHint', '先保存平台接入草稿，后续接后端持久化时可直接平移字段。')}
                </Paragraph>
              </div>
              <Tag color={draft.enabled ? 'success' : 'default'}>
                {draft.enabled
                  ? t('meetingSync.form.enabled', '已启用')
                  : t('meetingSync.form.disabled', '未启用')}
              </Tag>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Text strong>{t('meetingSync.form.provider', '接入平台')}</Text>
                <Select
                  className="mt-2 w-full"
                  value={draft.provider}
                  options={providerCards.map((provider) => ({
                    value: provider,
                    label: t(`meetingSync.providers.${provider}`, provider),
                  }))}
                  onChange={(value) => handleDraftChange('provider', value as ProviderKey)}
                />
              </Col>
              <Col xs={24} md={12}>
                <div className="flex h-full flex-col justify-end rounded-2xl bg-slate-50 px-4 py-3">
                  <Text strong>{t('meetingSync.form.syncEnabled', '同步开关')}</Text>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Text type="secondary">{t('meetingSync.form.syncEnabledHint', '仅保存草稿，不会立刻触发同步任务')}</Text>
                    <Switch checked={draft.enabled} onChange={(checked) => handleDraftChange('enabled', checked)} />
                  </div>
                </div>
              </Col>
              <Col xs={24} md={12}>
                <Text strong>{t('meetingSync.form.apiBaseUrl', '平台地址')}</Text>
                <Input
                  className="mt-2"
                  value={draft.apiBaseUrl}
                  placeholder={t('meetingSync.form.apiBaseUrlPlaceholder', '例如：https://open.feishu.cn')}
                  onChange={(event) => handleDraftChange('apiBaseUrl', event.target.value)}
                />
              </Col>
              <Col xs={24} md={12}>
                <Text strong>{t('meetingSync.form.clientId', '应用 ID')}</Text>
                <Input
                  className="mt-2"
                  value={draft.clientId}
                  placeholder={t('meetingSync.form.clientIdPlaceholder', '填写平台分配的 Client ID / App ID')}
                  onChange={(event) => handleDraftChange('clientId', event.target.value)}
                />
              </Col>
              <Col xs={24} md={12}>
                <Text strong>{t('meetingSync.form.clientSecret', '应用密钥')}</Text>
                <Input.Password
                  className="mt-2"
                  value={draft.clientSecret}
                  placeholder={t('meetingSync.form.clientSecretPlaceholder', '填写平台分配的密钥')}
                  onChange={(event) => handleDraftChange('clientSecret', event.target.value)}
                />
              </Col>
              <Col xs={24} md={12}>
                <Text strong>{t('meetingSync.form.syncMode', '同步模式')}</Text>
                <Select
                  className="mt-2 w-full"
                  value={draft.syncMode}
                  options={[
                    { value: 'manual', label: t('meetingSync.form.syncModes.manual', '手动触发') },
                    { value: 'scheduled', label: t('meetingSync.form.syncModes.scheduled', '定时轮询') },
                    { value: 'webhook', label: t('meetingSync.form.syncModes.webhook', 'Webhook 回流') },
                  ]}
                  onChange={(value) => handleDraftChange('syncMode', value as SyncMode)}
                />
              </Col>
              <Col xs={24} md={12}>
                <Text strong>{t('meetingSync.form.syncScope', '同步范围')}</Text>
                <Select
                  className="mt-2 w-full"
                  value={draft.syncScope}
                  options={[
                    { value: 'meetings', label: t('meetingSync.form.syncScopes.meetings', '仅会议') },
                    { value: 'meetings_rooms', label: t('meetingSync.form.syncScopes.meetingsRooms', '会议 + 会议室') },
                    { value: 'full', label: t('meetingSync.form.syncScopes.full', '全量对象') },
                  ]}
                  onChange={(value) => handleDraftChange('syncScope', value as SyncScope)}
                />
              </Col>
              <Col xs={24} md={12}>
                <Text strong>{t('meetingSync.form.roomMapping', '会议室映射')}</Text>
                <Select
                  className="mt-2 w-full"
                  value={draft.roomMapping}
                  options={[
                    { value: 'name', label: t('meetingSync.form.roomMappings.name', '按名称匹配') },
                    { value: 'external_id', label: t('meetingSync.form.roomMappings.externalId', '按外部 ID 匹配') },
                    { value: 'hybrid', label: t('meetingSync.form.roomMappings.hybrid', '混合策略') },
                  ]}
                  onChange={(value) => handleDraftChange('roomMapping', value as RoomMapping)}
                />
              </Col>
              {draft.syncMode === 'scheduled' ? (
                <Col xs={24}>
                  <Text strong>{t('meetingSync.form.syncCron', '轮询表达式')}</Text>
                  <Input
                    className="mt-2"
                    value={draft.syncCron}
                    placeholder={t('meetingSync.form.syncCronPlaceholder', '例如：0 */2 * * *')}
                    onChange={(event) => handleDraftChange('syncCron', event.target.value)}
                  />
                </Col>
              ) : null}
            </Row>
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Card className="border-0 shadow-sm">
            <div className="mb-5">
              <Title level={5} className="!mb-2">
                {t('meetingSync.sections.tasks', '同步任务占位')}
              </Title>
              <Paragraph className="!mb-0 text-slate-500">
                {t('meetingSync.sections.tasksHint', '先把同步链路拆成几个明确阶段，后续接任务引擎时直接替换占位数据。')}
              </Paragraph>
            </div>
            <List
              dataSource={taskPlaceholders}
              renderItem={(task) => (
                <List.Item className="!px-0">
                  <div className="w-full rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{task.title}</div>
                        <div className="mt-2 text-sm text-slate-500">{task.description}</div>
                      </div>
                      <Tag color={getTaskTagColor(task.status)}>{getTaskStatusLabel(task.status)}</Tag>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </Card>

          <Card className="mt-4 border-dashed border-slate-200 shadow-none bg-slate-50/80">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('meetingSync.empty', '当前尚未配置任何三方会议同步器。')}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
                <LinkOutlined />
                {t('meetingSync.hint', '接口预留完成后，可在此处配置平台凭据与同步规则。')}
              </div>
            </Empty>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MeetingThirdPartySync;
