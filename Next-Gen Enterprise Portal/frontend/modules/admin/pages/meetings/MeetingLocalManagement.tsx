import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Empty, message, Popconfirm, Row, Space, Tag, Typography } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, CopyOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { AppButton, AppDrawer, AppFilterBar, AppPageHeader, AppTable } from '@/modules/admin/components/ui';
import MeetingFormModal, { type MeetingFormValues } from '@/modules/admin/components/meetings/MeetingFormModal';
import meetingService, {
  type CreateLocalMeetingInput,
  type ListMeetingFilters,
  type LocalMeetingRecord,
  type MeetingStatus,
  type PaginatedMeetingSummary,
} from '@/modules/admin/services/meetings';
import ApiClient from '@/shared/services/api';
import type { UserOption } from '@/types';

const { Text } = Typography;
const DEFAULT_PAGE_SIZE = 10;
const EMPTY_SUMMARY: PaginatedMeetingSummary = {
  total: 0,
  upcoming: 0,
  online: 0,
  offline: 0,
};

type MeetingFilterState = {
  q: string;
  meetingType?: LocalMeetingRecord['meetingType'];
  organizerUserId?: number;
  attendeeUserId?: number;
  status?: MeetingStatus;
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
  const [summary, setSummary] = useState<PaginatedMeetingSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<LocalMeetingRecord | null>(null);
  const [detailMeeting, setDetailMeeting] = useState<LocalMeetingRecord | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
  });
  const [filters, setFilters] = useState<MeetingFilterState>({
    q: '',
    meetingType: undefined,
    organizerUserId: undefined,
    attendeeUserId: undefined,
    status: undefined,
    startRange: null,
  });

  const buildListFilters = (): ListMeetingFilters => ({
    q: filters.q || undefined,
    meetingType: filters.meetingType,
    startFrom: filters.startRange?.[0] ? filters.startRange[0].startOf('day').toISOString() : undefined,
    startTo: filters.startRange?.[1] ? filters.startRange[1].endOf('day').toISOString() : undefined,
    organizerUserId: filters.organizerUserId,
    attendeeUserId: filters.attendeeUserId,
    status: filters.status,
    limit: pagination.pageSize,
    offset: (pagination.current - 1) * pagination.pageSize,
  });

  const loadMeetings = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await meetingService.listMeetings(buildListFilters());
      setMeetings(data.items);
      setSummary(data.summary);
      setPagination((current) => {
        const nextTotal = data.total;
        const maxPage = Math.max(1, Math.ceil(nextTotal / current.pageSize));
        if (current.current > maxPage) {
          return { ...current, current: maxPage, total: nextTotal };
        }
        return { ...current, total: nextTotal };
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMeetings();
  }, [
    filters.attendeeUserId,
    filters.meetingType,
    filters.organizerUserId,
    filters.q,
    filters.startRange,
    filters.status,
    pagination.current,
    pagination.pageSize,
  ]);

  useEffect(() => {
    let active = true;

    const loadUsers = async (): Promise<void> => {
      setUsersLoading(true);
      try {
        const users = await ApiClient.getUserOptions();
        if (active) {
          setUserOptions(Array.isArray(users) ? users : []);
        }
      } finally {
        if (active) {
          setUsersLoading(false);
        }
      }
    };

    void loadUsers();
    return () => {
      active = false;
    };
  }, []);

  const selectableUserOptions = useMemo(
    () => userOptions.map((user) => ({
      value: user.id,
      label: user.name?.trim() ? `${user.name.trim()} / ${user.username}` : user.username,
    })),
    [userOptions],
  );

  const hasActiveFilters = Boolean(
    filters.q
      || filters.meetingType
      || filters.organizerUserId
      || filters.attendeeUserId
      || filters.status
      || filters.startRange,
  );

  useEffect(() => {
    if (!detailMeeting) {
      return;
    }
    const nextDetailMeeting = meetings.find((item) => item.id === detailMeeting.id);
    if (nextDetailMeeting && nextDetailMeeting !== detailMeeting) {
      setDetailMeeting(nextDetailMeeting);
    }
  }, [detailMeeting, meetings]);

  const handleSubmitMeeting = async (values: MeetingFormValues): Promise<void> => {
    const payload: CreateLocalMeetingInput = {
      subject: values.subject,
      startTime: values.startTime.toISOString(),
      durationMinutes: values.durationMinutes,
      meetingType: values.meetingType,
      meetingRoom: values.meetingRoom,
      meetingId: values.meetingId,
      organizerUserId: values.organizerUserId,
      attendeeUserIds: values.attendeeUserIds,
    };

    setSubmitLoading(true);
    try {
      if (editingMeeting) {
        await meetingService.updateMeeting(editingMeeting.id, payload);
        message.success(t('meetingLocal.messages.updateSuccess', '会议已更新'));
        await loadMeetings();
      } else {
        await meetingService.createMeeting(payload);
        message.success(t('meetingLocal.messages.createSuccess', '会议已创建'));
        setPagination((current) => ({ ...current, current: 1 }));
        if (pagination.current === 1) {
          await loadMeetings();
        }
      }
      setModalOpen(false);
      setEditingMeeting(null);
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
      if (meetings.length === 1 && pagination.current > 1) {
        setPagination((current) => ({ ...current, current: current.current - 1 }));
        return;
      }
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

  const handleView = (meeting: LocalMeetingRecord): void => {
    setDetailMeeting(meeting);
  };

  const handleEditFromDrawer = (): void => {
    if (!detailMeeting) {
      return;
    }
    setDetailMeeting(null);
    setEditingMeeting(detailMeeting);
    setModalOpen(true);
  };

  const handleModalCancel = (): void => {
    setModalOpen(false);
    setEditingMeeting(null);
  };

  const handleDrawerClose = (): void => {
    setDetailMeeting(null);
  };

  const handleResetFilters = (): void => {
    setFilters({
      q: '',
      meetingType: undefined,
      organizerUserId: undefined,
      attendeeUserId: undefined,
      status: undefined,
      startRange: null,
    });
    setPagination((current) => ({ ...current, current: 1 }));
  };

  const handleCopy = async (value: string, successMessage: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      message.success(successMessage);
    } catch {
      message.error(t('meetingLocal.messages.copyFailed', '复制失败，请稍后重试'));
    }
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
            icon={<EyeOutlined />}
            iconOnly
            aria-label={t('meetingLocal.actions.viewDetail', '查看详情')}
            onClick={() => handleView(record)}
          />
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
      value: summary.total,
      icon: <CalendarOutlined className="text-lg text-sky-600" />,
      accentClass: 'from-sky-500/10 to-cyan-500/5 border-sky-100',
    },
    {
      key: 'upcoming',
      label: t('meetingLocal.metrics.upcoming', '待开始会议'),
      value: summary.upcoming,
      icon: <ClockCircleOutlined className="text-lg text-amber-600" />,
      accentClass: 'from-amber-500/10 to-orange-500/5 border-amber-100',
    },
    {
      key: 'online',
      label: t('meetingLocal.metrics.online', '线上会议'),
      value: summary.online,
      icon: <TeamOutlined className="text-lg text-emerald-600" />,
      accentClass: 'from-emerald-500/10 to-green-500/5 border-emerald-100',
    },
    {
      key: 'offline',
      label: t('meetingLocal.metrics.offline', '线下会议'),
      value: summary.offline,
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
          placeholder={t('meetingLocal.filters.search', '按会议主题 / 会议室 / 会议 ID / 发起人 / 参会人搜索')}
          className="!w-64"
          onChange={(event) => {
            setFilters((current) => ({ ...current, q: event.target.value }));
            setPagination((current) => ({ ...current, current: 1 }));
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
            setPagination((current) => ({ ...current, current: 1 }));
          }}
        />
        <AppFilterBar.Select
          allowClear
          showSearch
          optionFilterProp="label"
          value={filters.organizerUserId}
          placeholder={t('meetingLocal.filters.organizer', '会议发起人')}
          width={220}
          loading={usersLoading}
          options={selectableUserOptions}
          onChange={(value) => {
            setFilters((current) => ({
              ...current,
              organizerUserId: typeof value === 'number' ? value : undefined,
            }));
            setPagination((current) => ({ ...current, current: 1 }));
          }}
        />
        <AppFilterBar.Select
          allowClear
          showSearch
          optionFilterProp="label"
          value={filters.attendeeUserId}
          placeholder={t('meetingLocal.filters.attendee', '参会人')}
          width={220}
          loading={usersLoading}
          options={selectableUserOptions}
          onChange={(value) => {
            setFilters((current) => ({
              ...current,
              attendeeUserId: typeof value === 'number' ? value : undefined,
            }));
            setPagination((current) => ({ ...current, current: 1 }));
          }}
        />
        <AppFilterBar.Select
          allowClear
          value={filters.status}
          placeholder={t('meetingLocal.filters.status', '会议状态')}
          width={180}
          options={[
            { value: 'upcoming', label: t('meetingLocal.status.upcoming', '即将开始') },
            { value: 'inProgress', label: t('meetingLocal.status.inProgress', '进行中') },
            { value: 'finished', label: t('meetingLocal.status.finished', '已结束') },
          ]}
          onChange={(value) => {
            setFilters((current) => ({
              ...current,
              status: value as MeetingStatus | undefined,
            }));
            setPagination((current) => ({ ...current, current: 1 }));
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
            setPagination((current) => ({ ...current, current: 1 }));
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
          pageSize={DEFAULT_PAGE_SIZE}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            onChange: (page, pageSize) => {
              setPagination((current) => ({
                ...current,
                current: page,
                pageSize: pageSize || current.pageSize,
              }));
            },
          }}
          locale={{
            emptyText: (
              <Empty
                description={hasActiveFilters
                  ? t('meetingLocal.emptyFiltered', '当前筛选条件下没有会议。')
                  : t('meetingLocal.empty', '当前还没有本地会议，先创建一场会议。')}
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
          organizerUserId: editingMeeting.organizerUserId ?? undefined,
          attendeeUserIds: editingMeeting.attendeeUserIds,
        } : undefined}
        confirmLoading={submitLoading}
        onCancel={handleModalCancel}
        onSubmit={handleSubmitMeeting}
      />

      <AppDrawer
        open={Boolean(detailMeeting)}
        title={detailMeeting?.subject || t('meetingLocal.drawer.title', '会议详情')}
        width={560}
        hideFooter
        extra={detailMeeting ? (
          <AppButton intent="primary" icon={<EditOutlined />} onClick={handleEditFromDrawer}>
            {t('meetingLocal.drawer.editCurrent', '编辑此会议')}
          </AppButton>
        ) : undefined}
        onClose={handleDrawerClose}
      >
        {detailMeeting ? (
          <div className="space-y-4">
            <Card className="border-0 bg-slate-50 shadow-none">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag color={detailMeeting.meetingType === 'online' ? 'blue' : 'gold'}>
                      {detailMeeting.meetingType === 'online'
                        ? t('meetingLocal.types.online', '线上')
                        : t('meetingLocal.types.offline', '线下')}
                    </Tag>
                    <Tag>{dayjs(detailMeeting.startTime).format('YYYY-MM-DD HH:mm')}</Tag>
                    <Tag>{`${detailMeeting.durationMinutes}${t('meetingLocal.units.minutes', '分钟')}`}</Tag>
                  </div>
                  <div className="mt-3 text-sm text-slate-500">
                    {t('meetingLocal.drawer.summary', '集中查看当前会议的核心信息，并支持快速复制关键字段。')}
                  </div>
                </div>
                <AppButton
                  intent="secondary"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void handleCopy(detailMeeting.meetingId, t('meetingLocal.messages.copyMeetingIdSuccess', '会议 ID 已复制'));
                  }}
                >
                  {t('meetingLocal.actions.copyMeetingId', '复制会议 ID')}
                </AppButton>
              </div>
            </Card>

            <Card className="border-0 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t('meetingLocal.drawer.startTime', '开始时间')}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {dayjs(detailMeeting.startTime).format('YYYY-MM-DD HH:mm')}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t('meetingLocal.drawer.duration', '会议时长')}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {detailMeeting.durationMinutes}
                    {t('meetingLocal.units.minutes', '分钟')}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t('meetingLocal.drawer.room', '会议室')}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-900">{detailMeeting.meetingRoom}</span>
                    <AppButton
                      intent="tertiary"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        void handleCopy(detailMeeting.meetingRoom, t('meetingLocal.messages.copyRoomSuccess', '会议室信息已复制'));
                      }}
                    >
                      {t('meetingLocal.actions.copy', '复制')}
                    </AppButton>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t('meetingLocal.drawer.meetingId', '会议 ID')}
                  </div>
                  <div className="mt-2 break-all text-sm font-semibold text-slate-900">{detailMeeting.meetingId}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t('meetingLocal.drawer.organizer', '会议发起人')}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{detailMeeting.organizer}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t('meetingLocal.drawer.updatedAt', '最后更新时间')}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {dayjs(detailMeeting.updatedAt).format('YYYY-MM-DD HH:mm')}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t('meetingLocal.drawer.createdAt', '创建时间')}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {dayjs(detailMeeting.createdAt).format('YYYY-MM-DD HH:mm')}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="border-0 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t('meetingLocal.drawer.attendees', '参会人')}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {t('meetingLocal.drawer.attendeeCount', '共 {{count}} 人', { count: detailMeeting.attendees.length })}
                  </div>
                </div>
                <AppButton
                  intent="secondary"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void handleCopy(detailMeeting.attendees.join(', '), t('meetingLocal.messages.copyAttendeesSuccess', '参会人已复制'));
                  }}
                >
                  {t('meetingLocal.actions.copyAttendees', '复制参会人')}
                </AppButton>
              </div>
              <Space size={[8, 8]} wrap>
                {detailMeeting.attendees.map((attendee) => (
                  <Tag key={`${detailMeeting.id}-${attendee}`}>{attendee}</Tag>
                ))}
              </Space>
            </Card>
          </div>
        ) : null}
      </AppDrawer>
    </div>
  );
};

export default MeetingLocalManagement;
