import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Empty, message, Popconfirm, Row, Space, Tag, Typography } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { AppButton, AppFilterBar, AppPageHeader, AppTable } from '@/modules/admin/components/ui';
import MeetingFormModal, { type MeetingFormValues } from '@/modules/admin/components/meetings/MeetingFormModal';
import meetingService, {
  type CreateLocalMeetingInput,
  type ListMeetingFilters,
  type LocalMeetingRecord,
} from '@/modules/admin/services/meetings';

const { Text } = Typography;

type MeetingFilterState = {
  q: string;
  meetingType?: LocalMeetingRecord['meetingType'];
  startRange: [Dayjs, Dayjs] | null;
};

type ApiLikeError = {
  response?: {
    data?: {
      detail?: unknown;
    };
  };
  message?: unknown;
};

const resolveErrorMessage = (error: unknown, fallback: string): string => {
  const detail = (error as ApiLikeError)?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  const errorMessage = (error as ApiLikeError)?.message;
  return typeof errorMessage === 'string' && errorMessage.trim() ? errorMessage : fallback;
};

const MeetingLocalManagement: React.FC = () => {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<LocalMeetingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<LocalMeetingRecord | null>(null);
  const [filters, setFilters] = useState<MeetingFilterState>({
    q: '',
    meetingType: undefined,
    startRange: null,
  });

  const buildListFilters = (): ListMeetingFilters => ({
    q: filters.q || undefined,
    meetingType: filters.meetingType,
    startFrom: filters.startRange?.[0] ? filters.startRange[0].startOf('day').toISOString() : undefined,
    startTo: filters.startRange?.[1] ? filters.startRange[1].endOf('day').toISOString() : undefined,
  });

  const loadMeetings = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await meetingService.listMeetings(buildListFilters());
      setMeetings(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMeetings();
  }, [filters.q, filters.meetingType, filters.startRange]);

  const metrics = useMemo(() => {
    const now = dayjs();
    return {
      total: meetings.length,
      upcoming: meetings.filter((item) => dayjs(item.startTime).isAfter(now)).length,
      online: meetings.filter((item) => item.meetingType === 'online').length,
      offline: meetings.filter((item) => item.meetingType === 'offline').length,
    };
  }, [meetings]);

  const handleSubmitMeeting = async (values: MeetingFormValues): Promise<void> => {
    const payload: CreateLocalMeetingInput = {
      subject: values.subject,
      startTime: values.startTime.toISOString(),
      durationMinutes: values.durationMinutes,
      meetingType: values.meetingType,
      meetingRoom: values.meetingRoom,
      meetingId: values.meetingId,
      organizer: values.organizer,
      attendees: values.attendees,
    };

    setSubmitLoading(true);
    try {
      if (editingMeeting) {
        await meetingService.updateMeeting(editingMeeting.id, payload);
        message.success(t('meetingLocal.messages.updateSuccess', '会议已更新'));
      } else {
        await meetingService.createMeeting(payload);
        message.success(t('meetingLocal.messages.createSuccess', '会议已创建'));
      }
      setModalOpen(false);
      setEditingMeeting(null);
      await loadMeetings();
    } catch (error) {
      message.error(
        resolveErrorMessage(
          error,
          editingMeeting
            ? t('meetingLocal.messages.updateFailed', '更新会议失败')
            : t('meetingLocal.messages.createFailed', '创建会议失败'),
        ),
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteMeeting = async (id: number): Promise<void> => {
    try {
      await meetingService.deleteMeeting(id);
      message.success(t('meetingLocal.messages.deleteSuccess', '会议已删除'));
      await loadMeetings();
    } catch (error) {
      message.error(resolveErrorMessage(error, t('meetingLocal.messages.deleteFailed', '删除会议失败')));
    }
  };

  const handleCreate = (): void => {
    setEditingMeeting(null);
    setModalOpen(true);
  };

  const handleEdit = (meeting: LocalMeetingRecord): void => {
    setEditingMeeting(meeting);
    setModalOpen(true);
  };

  const handleModalCancel = (): void => {
    setModalOpen(false);
    setEditingMeeting(null);
  };

  const handleResetFilters = (): void => {
    setFilters({
      q: '',
      meetingType: undefined,
      startRange: null,
    });
  };

  const columns: ColumnsType<LocalMeetingRecord> = [
    {
      title: t('meetingLocal.table.subject', '会议主题'),
      dataIndex: 'subject',
      key: 'subject',
      width: 220,
      render: (value: string, record) => (
        <div className="min-w-[180px]">
          <div className="font-semibold text-slate-800">{value}</div>
          <div className="text-xs text-slate-400 mt-1">{t('meetingLocal.table.createdAt', '创建于')} {dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')}</div>
        </div>
      ),
    },
    {
      title: t('meetingLocal.table.startTime', '开始时间'),
      dataIndex: 'startTime',
      key: 'startTime',
      width: 170,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('meetingLocal.table.duration', '会议时长'),
      dataIndex: 'durationMinutes',
      key: 'durationMinutes',
      width: 120,
      render: (value: number) => `${value}${t('meetingLocal.units.minutes', '分钟')}`,
    },
    {
      title: t('meetingLocal.table.type', '会议类型'),
      dataIndex: 'meetingType',
      key: 'meetingType',
      width: 120,
      render: (value: LocalMeetingRecord['meetingType']) => (
        <Tag color={value === 'online' ? 'blue' : 'gold'}>
          {value === 'online' ? t('meetingLocal.types.online', '线上') : t('meetingLocal.types.offline', '线下')}
        </Tag>
      ),
    },
    {
      title: t('meetingLocal.table.room', '会议室'),
      dataIndex: 'meetingRoom',
      key: 'meetingRoom',
      width: 180,
    },
    {
      title: t('meetingLocal.table.meetingId', '会议 ID'),
      dataIndex: 'meetingId',
      key: 'meetingId',
      width: 220,
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: t('meetingLocal.table.organizer', '会议发起人'),
      dataIndex: 'organizer',
      key: 'organizer',
      width: 140,
    },
    {
      title: t('meetingLocal.table.attendees', '参会人'),
      dataIndex: 'attendees',
      key: 'attendees',
      width: 260,
      render: (value: string[]) => (
        <Space size={[4, 8]} wrap>
          {value.map((attendee) => (
            <Tag key={attendee}>{attendee}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: t('common.actions', '操作'),
      key: 'actions',
      width: 132,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <AppButton
            intent="tertiary"
            icon={<EditOutlined />}
            iconOnly
            aria-label={t('meetingLocal.actions.edit', '编辑会议')}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title={t('meetingLocal.actions.deleteConfirm', '确认删除这场会议吗？')}
            okText={t('common.buttons.confirm', '确认')}
            cancelText={t('common.buttons.cancel', '取消')}
            onConfirm={() => {
              void handleDeleteMeeting(record.id);
            }}
          >
            <AppButton intent="danger" icon={<DeleteOutlined />} iconOnly aria-label={t('meetingLocal.actions.delete', '删除会议')} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const summaryCards = [
    {
      key: 'total',
      label: t('meetingLocal.metrics.total', '本地会议总数'),
      value: metrics.total,
      icon: <CalendarOutlined className="text-lg text-sky-600" />,
      accentClass: 'from-sky-500/10 to-cyan-500/5 border-sky-100',
    },
    {
      key: 'upcoming',
      label: t('meetingLocal.metrics.upcoming', '待开始会议'),
      value: metrics.upcoming,
      icon: <ClockCircleOutlined className="text-lg text-amber-600" />,
      accentClass: 'from-amber-500/10 to-orange-500/5 border-amber-100',
    },
    {
      key: 'online',
      label: t('meetingLocal.metrics.online', '线上会议'),
      value: metrics.online,
      icon: <TeamOutlined className="text-lg text-emerald-600" />,
      accentClass: 'from-emerald-500/10 to-green-500/5 border-emerald-100',
    },
    {
      key: 'offline',
      label: t('meetingLocal.metrics.offline', '线下会议'),
      value: metrics.offline,
      icon: <TeamOutlined className="text-lg text-fuchsia-600" />,
      accentClass: 'from-fuchsia-500/10 to-pink-500/5 border-fuchsia-100',
    },
  ];

  return (
    <div className="space-y-6">
      <AppPageHeader
        title={t('meetingLocal.page.title', '会议管理 / 本地管理')}
        subtitle={t('meetingLocal.page.subtitle', '创建并维护门户后台的本地会议台账，后续可平滑接入三方会议平台。')}
        action={(
          <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            {t('meetingLocal.actions.create', '创建会议')}
          </AppButton>
        )}
      />

      <AppFilterBar>
        <AppFilterBar.Search
          value={filters.q}
          placeholder={t('meetingLocal.filters.search', '按会议主题搜索')}
          className="!w-64"
          onChange={(event) => {
            setFilters((current) => ({ ...current, q: event.target.value }));
          }}
        />
        <AppFilterBar.Select
          allowClear
          value={filters.meetingType}
          placeholder={t('meetingLocal.filters.type', '会议类型')}
          width={160}
          options={[
            { value: 'online', label: t('meetingLocal.types.online', '线上') },
            { value: 'offline', label: t('meetingLocal.types.offline', '线下') },
          ]}
          onChange={(value) => {
            setFilters((current) => ({
              ...current,
              meetingType: value as LocalMeetingRecord['meetingType'] | undefined,
            }));
          }}
        />
        <AppFilterBar.DateRange
          value={filters.startRange}
          className="min-w-[280px]"
          format="YYYY-MM-DD"
          onChange={(values) => {
            setFilters((current) => ({
              ...current,
              startRange: values?.[0] && values?.[1] ? [values[0], values[1]] : null,
            }));
          }}
        />
        <AppFilterBar.Action>
          <AppButton intent="secondary" icon={<ReloadOutlined />} onClick={handleResetFilters}>
            {t('meetingLocal.actions.resetFilters', '重置筛选')}
          </AppButton>
        </AppFilterBar.Action>
      </AppFilterBar>

      <Row gutter={[16, 16]}>
        {summaryCards.map((item) => (
          <Col xs={24} sm={12} xl={6} key={item.key}>
            <Card className={`border ${item.accentClass} bg-gradient-to-br shadow-sm`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-500">{item.label}</div>
                  <div className="mt-3 text-3xl font-bold text-slate-900">{item.value}</div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                  {item.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="border-0 shadow-sm">
        <AppTable<LocalMeetingRecord>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={meetings}
          pageSize={10}
          locale={{
            emptyText: (
              <Empty
                description={t('meetingLocal.empty', '当前还没有本地会议，先创建一场会议。')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
        />
      </Card>

      <MeetingFormModal
        open={modalOpen}
        mode={editingMeeting ? 'edit' : 'create'}
        initialValues={editingMeeting ? {
          subject: editingMeeting.subject,
          startTime: dayjs(editingMeeting.startTime),
          durationMinutes: editingMeeting.durationMinutes,
          meetingType: editingMeeting.meetingType,
          meetingRoom: editingMeeting.meetingRoom,
          meetingId: editingMeeting.meetingId,
          organizer: editingMeeting.organizer,
          attendees: editingMeeting.attendees,
        } : undefined}
        confirmLoading={submitLoading}
        onCancel={handleModalCancel}
        onSubmit={handleSubmitMeeting}
      />
    </div>
  );
};

export default MeetingLocalManagement;
