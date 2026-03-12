import React from 'react';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Descriptions from 'antd/es/descriptions';
import List from 'antd/es/list';
import Row from 'antd/es/grid/row';
import Space from 'antd/es/space';
import Statistic from 'antd/es/statistic';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { CopyOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import { AppButton, AppDrawer } from '@/modules/admin/components/ui';
import type { LocalMeetingRecord } from '@/modules/admin/services/meetings';

const { Text } = Typography;

const resolveMeetingVenue = (meeting: Pick<LocalMeetingRecord, 'meetingType' | 'meetingRoom' | 'meetingSoftware'>): string => (
  meeting.meetingType === 'online'
    ? (meeting.meetingSoftware || meeting.meetingRoom)
    : meeting.meetingRoom
);

interface MeetingDetailDrawerProps {
  open: boolean;
  meeting: LocalMeetingRecord | null;
  onClose: () => void;
  onEdit: () => void;
  onCopy: (value: string, successMessage: string) => Promise<void> | void;
}

const MeetingDetailDrawer: React.FC<MeetingDetailDrawerProps> = ({
  open,
  meeting,
  onClose,
  onEdit,
  onCopy,
}) => {
  const { t } = useTranslation();

  if (!meeting) {
    return null;
  }

  const detailMeetingVenueLabel = meeting.meetingType === 'online'
    ? t('meetingLocal.drawer.meetingSoftware', '会议软件')
    : t('meetingLocal.drawer.room', '会议室');
  const detailMeetingVenueValue = resolveMeetingVenue(meeting);
  const detailMeetingIdLabel = meeting.meetingType === 'online'
    ? t('meetingLocal.drawer.onlineMeetingId', '会议 ID / 会议链接')
    : t('meetingLocal.drawer.meetingId', '会议 ID');
  const detailMeetingIdActionLabel = meeting.meetingType === 'online'
    ? t('meetingLocal.actions.copyMeetingEntry', '复制会议 ID / 链接')
    : t('meetingLocal.actions.copyMeetingId', '复制会议 ID');
  const detailMeetingIdCopySuccess = meeting.meetingType === 'online'
    ? t('meetingLocal.messages.copyMeetingEntrySuccess', '会议 ID / 链接已复制')
    : t('meetingLocal.messages.copyMeetingIdSuccess', '会议 ID 已复制');

  return (
    <AppDrawer
      open={open}
      title={meeting.subject || t('meetingLocal.drawer.title', '会议详情')}
      width={560}
      hideFooter
      extra={(
        <AppButton intent="primary" icon={<EditOutlined />} onClick={onEdit}>
          {t('meetingLocal.drawer.editCurrent', '编辑此会议')}
        </AppButton>
      )}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Card className="admin-card admin-card-subtle">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Tag color={meeting.meetingType === 'online' ? 'blue' : 'gold'}>
                  {meeting.meetingType === 'online'
                    ? t('meetingLocal.types.online', '线上')
                    : t('meetingLocal.types.offline', '线下')}
                </Tag>
                <Tag>{dayjs(meeting.startTime).format('YYYY-MM-DD HH:mm')}</Tag>
                <Tag>{`${meeting.durationMinutes}${t('meetingLocal.units.minutes', '分钟')}`}</Tag>
              </div>
              <Text type="secondary" className="mt-3 block">
                {t('meetingLocal.drawer.summary', '集中查看当前会议的核心信息，并支持快速复制关键字段。')}
              </Text>
            </div>
            <AppButton
              intent="secondary"
              icon={<CopyOutlined />}
              onClick={() => {
                void onCopy(meeting.meetingId, detailMeetingIdCopySuccess);
              }}
            >
              {detailMeetingIdActionLabel}
            </AppButton>
          </div>
        </Card>

        <Card className="admin-card">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Statistic
                title={t('meetingLocal.drawer.startTime', '开始时间')}
                value={dayjs(meeting.startTime).format('YYYY-MM-DD HH:mm')}
              />
            </Col>
            <Col xs={24} md={8}>
              <Statistic
                title={t('meetingLocal.drawer.duration', '会议时长')}
                value={meeting.durationMinutes}
                suffix={t('meetingLocal.units.minutes', '分钟')}
              />
            </Col>
            <Col xs={24} md={8}>
              <Statistic
                title={t('meetingLocal.drawer.attendees', '参会人')}
                value={meeting.attendees.length}
                suffix={t('meetingLocal.units.people', '人')}
              />
            </Col>
          </Row>
        </Card>

        <Card className="admin-card">
          <Descriptions
            bordered
            column={1}
            size="middle"
            colon={false}
            labelStyle={{ width: '34%' }}
          >
            <Descriptions.Item label={t('meetingLocal.drawer.type', '会议类型')}>
              <Tag color={meeting.meetingType === 'online' ? 'blue' : 'gold'}>
                {meeting.meetingType === 'online'
                  ? t('meetingLocal.types.online', '线上')
                  : t('meetingLocal.types.offline', '线下')}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={detailMeetingVenueLabel}>
              <Space wrap>
                <Text strong>{detailMeetingVenueValue}</Text>
                <AppButton
                  intent="tertiary"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void onCopy(detailMeetingVenueValue, t('meetingLocal.messages.copyVenueSuccess', '会议信息已复制'));
                  }}
                >
                  {t('meetingLocal.actions.copy', '复制')}
                </AppButton>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label={detailMeetingIdLabel}>
              <Space wrap>
                <Text strong className="break-all">{meeting.meetingId}</Text>
                <AppButton
                  intent="tertiary"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void onCopy(meeting.meetingId, detailMeetingIdCopySuccess);
                  }}
                >
                  {detailMeetingIdActionLabel}
                </AppButton>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label={t('meetingLocal.drawer.organizer', '会议发起人')}>
              <Text strong>{meeting.organizer}</Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('meetingLocal.drawer.updatedAt', '最后更新时间')}>
              <Text strong>{dayjs(meeting.updatedAt).format('YYYY-MM-DD HH:mm')}</Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('meetingLocal.drawer.createdAt', '创建时间')}>
              <Text strong>{dayjs(meeting.createdAt).format('YYYY-MM-DD HH:mm')}</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card className="admin-card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Space direction="vertical" size={2}>
              <Text strong>{t('meetingLocal.drawer.attendees', '参会人')}</Text>
              <Text type="secondary">
                {t('meetingLocal.drawer.attendeeCount', '共 {{count}} 人', { count: meeting.attendees.length })}
              </Text>
            </Space>
            <AppButton
              intent="secondary"
              icon={<CopyOutlined />}
              onClick={() => {
                void onCopy(meeting.attendees.join(', '), t('meetingLocal.messages.copyAttendeesSuccess', '参会人已复制'));
              }}
            >
              {t('meetingLocal.actions.copyAttendees', '复制参会人')}
            </AppButton>
          </div>
          <List
            size="small"
            dataSource={meeting.attendees}
            locale={{ emptyText: t('meetingLocal.drawer.emptyAttendees', '暂无参会人') }}
            renderItem={(attendee) => (
              <List.Item key={`${meeting.id}-${attendee}`}>
                <Text>{attendee}</Text>
              </List.Item>
            )}
          />
        </Card>
      </div>
    </AppDrawer>
  );
};

export default MeetingDetailDrawer;
