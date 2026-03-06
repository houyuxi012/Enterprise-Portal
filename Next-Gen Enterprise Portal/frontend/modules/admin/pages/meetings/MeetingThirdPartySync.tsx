import React from 'react';
import { Alert, Card, Col, Empty, Row, Tag, Typography } from 'antd';
import { LinkOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AppPageHeader } from '@/modules/admin/components/ui';

const providerCards = ['腾讯会议', '飞书会议', '钉钉会议', 'Zoom', 'Microsoft Teams'];

const MeetingThirdPartySync: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <AppPageHeader
        title={t('meetingSync.page.title', '会议管理 / 三方同步')}
        subtitle={t('meetingSync.page.subtitle', '用于对接外部会议平台、同步会议信息和会议室资源。当前入口先预留。')}
      />

      <Alert
        type="info"
        showIcon
        icon={<SyncOutlined />}
        message={t('meetingSync.status.title', '待开发')}
        description={t('meetingSync.status.description', '三方会议同步能力尚未接入。后续可在这里对接腾讯会议、飞书会议、钉钉会议、Zoom 或 Teams。')}
      />

      <Row gutter={[16, 16]}>
        {providerCards.map((provider) => (
          <Col xs={24} md={12} xl={8} key={provider}>
            <Card className="h-full border-0 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Typography.Title level={5} className="!mb-2">
                    {provider}
                  </Typography.Title>
                  <Typography.Paragraph className="!mb-0 text-slate-500">
                    {t('meetingSync.provider.description', '支持会议创建、成员同步、会议室映射和会议记录回流。')}
                  </Typography.Paragraph>
                </div>
                <Tag color="processing">{t('meetingSync.status.pending', '待开发')}</Tag>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="border-dashed border-slate-200 shadow-none bg-slate-50/80">
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
    </div>
  );
};

export default MeetingThirdPartySync;
