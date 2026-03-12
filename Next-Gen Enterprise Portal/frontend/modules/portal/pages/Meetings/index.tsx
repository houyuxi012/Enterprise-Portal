import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Alert from 'antd/es/alert';
import App from 'antd/es/app';
import Button from 'antd/es/button';
import DatePicker from 'antd/es/date-picker';
import Drawer from 'antd/es/drawer';
import Empty from 'antd/es/empty';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Modal from 'antd/es/modal';
import Select from 'antd/es/select';
import Skeleton from 'antd/es/skeleton';
import Tag from 'antd/es/tag';
import { ArrowLeft, CalendarClock, Clock3, MapPin, Monitor, Plus, Search } from 'lucide-react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';

import portalMeetingService, { type PortalMeetingListItem } from '@/modules/portal/services/meetings';

const POLL_INTERVAL_MS = 30000;
type MeetingStatusFilter = 'all' | 'upcoming' | 'inProgress' | 'finished';

const getMeetingStatus = (meeting: PortalMeetingListItem): Exclude<MeetingStatusFilter, 'all'> => {
  const start = dayjs(meeting.startTime);
  const end = start.add(meeting.durationMinutes, 'minute');
  const now = dayjs();

  if (now.isAfter(end)) {
    return 'finished';
  }
  if (now.isAfter(start) && now.isBefore(end)) {
    return 'inProgress';
  }
  return 'upcoming';
};

interface MeetingsPageProps {
  onBack?: () => void;
}

interface PortalMeetingFormValues {
  subject: string;
  startTime: Dayjs;
  durationMinutes: number;
  meetingType: 'online' | 'offline';
  meetingRoom: string;
  meetingSoftware: string;
  meetingId: string;
  attendees: string[];
}

type LicenseErrorDetail = {
  code?: string;
  message?: string;
};

const extractLicenseErrorDetail = (error: unknown): LicenseErrorDetail => {
  if (!error || typeof error !== 'object') return {};
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object') return {};
  const data = (response as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return {};
  const detail = (data as { detail?: unknown }).detail;
  if (!detail || typeof detail !== 'object') return {};
  return {
    code: typeof (detail as { code?: unknown }).code === 'string' ? (detail as { code?: string }).code : undefined,
    message: typeof (detail as { message?: unknown }).message === 'string' ? (detail as { message?: string }).message : undefined,
  };
};

const isMeetingLicenseBlockedError = (error: unknown): boolean => {
  const detail = extractLicenseErrorDetail(error);
  return detail.code === 'LICENSE_REQUIRED' || detail.code === 'LICENSE_READ_ONLY';
};

const buildDefaultMeetingStartTime = (): Dayjs => dayjs().add(30, 'minute').second(0).millisecond(0);

const resolveMeetingVenue = (meeting: Pick<PortalMeetingListItem, 'meetingType' | 'meetingRoom' | 'meetingSoftware'>): string => (
  meeting.meetingType === 'online'
    ? (meeting.meetingSoftware || meeting.meetingRoom)
    : meeting.meetingRoom
);

const MeetingsPage: React.FC<MeetingsPageProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<PortalMeetingFormValues>();
  const createMeetingType = Form.useWatch('meetingType', form) ?? 'online';
  const [meetings, setMeetings] = useState<PortalMeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('');
  const [subjectQuery, setSubjectQuery] = useState('');
  const [meetingTypeFilter, setMeetingTypeFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [meetingStatusFilter, setMeetingStatusFilter] = useState<MeetingStatusFilter>('all');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [meetingLicenseBlocked, setMeetingLicenseBlocked] = useState(false);
  const [meetingLicenseBlockedMessage, setMeetingLicenseBlockedMessage] = useState('');

  const loadMeetings = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    }

    try {
      const data = await portalMeetingService.listTodayMeetings();
      setMeetings(data);
      setLastUpdatedAt(dayjs().format('HH:mm:ss'));
      setMeetingLicenseBlocked(false);
      setMeetingLicenseBlockedMessage('');
    } catch (error) {
      if (isMeetingLicenseBlockedError(error)) {
        const detail = extractLicenseErrorDetail(error);
        setMeetings([]);
        setMeetingLicenseBlocked(true);
        setMeetingLicenseBlockedMessage(detail.message || t('portalMeetings.licenseBlocked'));
        setSelectedMeetingId(null);
        setCreateModalOpen(false);
        return;
      }
      throw error;
    } finally {
      if (mode === 'initial') {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    void loadMeetings('initial').catch((error) => {
      console.error('Failed to fetch today meetings', error);
    });
  }, [loadMeetings]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !meetingLicenseBlocked) {
        void loadMeetings('refresh').catch((error) => {
          console.error('Failed to refresh today meetings', error);
        });
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [loadMeetings, meetingLicenseBlocked]);

  const filteredMeetings = useMemo(() => {
    const normalizedQuery = subjectQuery.trim().toLowerCase();
    return meetings.filter((item) => {
      const matchesQuery = !normalizedQuery
        || item.subject.toLowerCase().includes(normalizedQuery)
        || item.organizer.toLowerCase().includes(normalizedQuery)
        || resolveMeetingVenue(item).toLowerCase().includes(normalizedQuery);
      const matchesType = meetingTypeFilter === 'all' || item.meetingType === meetingTypeFilter;
      const matchesStatus = meetingStatusFilter === 'all' || getMeetingStatus(item) === meetingStatusFilter;
      return matchesQuery && matchesType && matchesStatus;
    });
  }, [meetingStatusFilter, meetingTypeFilter, meetings, subjectQuery]);

  const nextMeeting = filteredMeetings.find((item) => getMeetingStatus(item) === 'upcoming') ?? null;
  const selectedMeeting = meetings.find((item) => item.meetingId === selectedMeetingId) ?? null;

  const metrics = useMemo(() => ({
    total: filteredMeetings.length,
    online: filteredMeetings.filter((item) => item.meetingType === 'online').length,
    offline: filteredMeetings.filter((item) => item.meetingType === 'offline').length,
  }), [filteredMeetings]);

  const hasActiveFilters = subjectQuery.trim().length > 0 || meetingTypeFilter !== 'all' || meetingStatusFilter !== 'all';

  const openMeetingDetail = (meetingId: string): void => {
    setSelectedMeetingId(meetingId);
  };

  const closeMeetingDetail = (): void => {
    setSelectedMeetingId(null);
  };

  const openCreateMeetingModal = (): void => {
    if (meetingLicenseBlocked) {
      message.warning(meetingLicenseBlockedMessage || t('portalMeetings.licenseBlocked'));
      return;
    }
    form.setFieldsValue({
      subject: '',
      startTime: buildDefaultMeetingStartTime(),
      durationMinutes: 60,
      meetingType: 'online',
      meetingRoom: '',
      meetingSoftware: '',
      meetingId: '',
      attendees: [],
    });
    setCreateModalOpen(true);
  };

  const closeCreateMeetingModal = (): void => {
    setCreateModalOpen(false);
    form.resetFields();
  };

  const handleCreateMeeting = async (): Promise<void> => {
    const values = await form.validateFields();
    const attendees = values.attendees
      .map((attendee) => String(attendee || '').trim())
      .filter(Boolean);

    setCreating(true);
    try {
      await portalMeetingService.createMeeting({
        subject: values.subject.trim(),
        startTime: values.startTime.toISOString(),
        durationMinutes: values.durationMinutes,
        meetingType: values.meetingType,
        meetingRoom: values.meetingRoom.trim(),
        meetingSoftware: values.meetingSoftware.trim(),
        meetingId: values.meetingId.trim(),
        attendees,
      });
      message.success(t('portalMeetings.messages.createSuccess', '会议已创建'));
      closeCreateMeetingModal();
      await loadMeetings('refresh');
    } catch (error) {
      if (isMeetingLicenseBlockedError(error)) {
        const detail = extractLicenseErrorDetail(error);
        setMeetingLicenseBlocked(true);
        setMeetingLicenseBlockedMessage(detail.message || t('portalMeetings.licenseBlocked'));
        setCreateModalOpen(false);
        message.warning(detail.message || t('portalMeetings.licenseBlocked'));
        return;
      }
      message.error(t('portalMeetings.messages.createFailed', '创建会议失败'));
      throw error;
    } finally {
      setCreating(false);
    }
  };

  const statusLabel = (meeting: PortalMeetingListItem): string => {
    const status = getMeetingStatus(meeting);
    if (status === 'finished') {
      return t('portalMeetings.status.finished', '已结束');
    }
    if (status === 'inProgress') {
      return t('portalMeetings.status.inProgress', '进行中');
    }
    return t('portalMeetings.status.upcoming', '即将开始');
  };

  const statusStyles = (meeting: PortalMeetingListItem): string => {
    const status = getMeetingStatus(meeting);
    if (status === 'finished') {
      return 'bg-slate-100 text-slate-500';
    }
    if (status === 'inProgress') {
      return 'bg-emerald-100 text-emerald-700';
    }
    return 'bg-blue-100 text-blue-700';
  };

  const isOnlineMeeting = createMeetingType === 'online';
  const createMeetingVenueLabel = isOnlineMeeting
    ? t('portalMeetings.form.meetingSoftware', '会议软件')
    : t('portalMeetings.form.room', '会议室');
  const createMeetingVenuePlaceholder = isOnlineMeeting
    ? t('portalMeetings.form.meetingSoftwarePlaceholder', '例如：腾讯会议 / 飞书会议 / Teams')
    : t('portalMeetings.form.roomPlaceholder', '例如：18F 星海会议室');
  const createMeetingVenueValidation = isOnlineMeeting
    ? t('portalMeetings.validation.meetingSoftware', '请输入会议软件')
    : t('portalMeetings.validation.room', '请输入会议室');
  const createMeetingIdLabel = isOnlineMeeting
    ? t('portalMeetings.form.onlineMeetingId', '会议 ID / 会议链接')
    : t('portalMeetings.form.meetingId', '会议 ID');
  const createMeetingIdPlaceholder = isOnlineMeeting
    ? t('portalMeetings.form.onlineMeetingIdPlaceholder', '例如：904-123-456 或 https://meeting.tencent.com/xxx')
    : t('portalMeetings.form.meetingIdPlaceholder', '例如：腾讯会议 904-123-456');
  const createMeetingIdValidation = isOnlineMeeting
    ? t('portalMeetings.validation.onlineMeetingId', '请输入会议 ID 或会议链接')
    : t('portalMeetings.validation.meetingId', '请输入会议 ID');

  return (
    <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8 min-h-[80vh]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400 transition-colors hover:text-blue-600"
          >
            <ArrowLeft size={14} />
            {t('portalMeetings.actions.back', '返回首页')}
          </button>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {t('portalMeetings.title', '今日会议')}
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
              {t('portalMeetings.subtitle', '查看今日会议安排，支持自动刷新，后台新增后将自动同步到当前列表。')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {[
            { key: 'total', label: t('portalMeetings.metrics.total', '总场次'), value: metrics.total.toString() },
            { key: 'online', label: t('portalMeetings.metrics.online', '线上'), value: metrics.online.toString() },
            { key: 'offline', label: t('portalMeetings.metrics.offline', '线下'), value: metrics.offline.toString() },
          ].map((metric) => (
            <div
              key={metric.key}
              className="mica rounded-[1.75rem] border border-white/50 px-5 py-4 shadow-lg shadow-slate-200/20 dark:shadow-none"
            >
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{metric.label}</div>
              <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">{metric.value}</div>
            </div>
          ))}
          <Button
            onClick={openCreateMeetingModal}
            disabled={meetingLicenseBlocked}
            className="!h-12 !rounded-full !border-slate-950 !bg-slate-950 !px-5 !font-bold !text-white shadow-lg shadow-slate-900/15 transition-all hover:!border-slate-800 hover:!bg-slate-800 hover:!text-white"
            icon={<Plus size={16} />}
          >
            {t('portalMeetings.actions.create', '创建会议')}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="mica rounded-[2rem] border border-white/50 p-6 shadow-xl shadow-slate-200/20 dark:shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                {t('portalMeetings.sections.timeline', '时间线')}
              </div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900 dark:text-white">
                {t('portalMeetings.sections.todaySchedule', '今日会议安排')}
              </h2>
            </div>
            {lastUpdatedAt ? (
              <div className="text-[11px] font-bold text-slate-400">
                {t('portalMeetings.lastUpdated', '已更新于 {{time}}', { time: lastUpdatedAt })}
              </div>
            ) : null}
          </div>

          <div className="mt-6 space-y-4">
            {meetingLicenseBlocked ? (
              <>
                <Alert
                  showIcon
                  type="warning"
                  className="!rounded-2xl"
                  message={t('portalMeetings.licenseBlockedTitle', '会议功能未授权')}
                  description={meetingLicenseBlockedMessage || t('portalMeetings.licenseBlocked')}
                />
                <div className="rounded-[1.75rem] border border-dashed border-amber-200 bg-amber-50/70 py-20 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <Empty
                    description={meetingLicenseBlockedMessage || t('portalMeetings.licenseBlocked')}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="rounded-[1.5rem] bg-slate-50/80 p-4 dark:bg-slate-900/40">
                  <div className="flex flex-col gap-3">
                    <div className="relative flex-1">
                      <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={subjectQuery}
                        onChange={(event) => setSubjectQuery(event.target.value)}
                        placeholder={t('portalMeetings.filters.searchPlaceholder', '搜索会议主题 / 发起人 / 会议室 / 会议软件')}
                        className="h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500/40 dark:focus:ring-blue-500/10"
                      />
                    </div>
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {t('portalMeetings.filters.type', '会议类型')}
                          </span>
                          {([
                            { key: 'all', label: t('portalMeetings.filters.all', '全部') },
                            { key: 'online', label: t('portalMeetings.types.online', '线上') },
                            { key: 'offline', label: t('portalMeetings.types.offline', '线下') },
                          ] as const).map((filter) => (
                            <button
                              key={filter.key}
                              type="button"
                              onClick={() => setMeetingTypeFilter(filter.key)}
                              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${meetingTypeFilter === filter.key
                                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                : 'bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                }`}
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {t('portalMeetings.filters.status', '会议状态')}
                          </span>
                          {([
                            { key: 'all', label: t('portalMeetings.filters.all', '全部') },
                            { key: 'upcoming', label: t('portalMeetings.status.upcoming', '即将开始') },
                            { key: 'inProgress', label: t('portalMeetings.status.inProgress', '进行中') },
                            { key: 'finished', label: t('portalMeetings.status.finished', '已结束') },
                          ] as const).map((filter) => (
                            <button
                              key={filter.key}
                              type="button"
                              onClick={() => setMeetingStatusFilter(filter.key)}
                              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${meetingStatusFilter === filter.key
                                ? 'bg-blue-600 text-white dark:bg-blue-500'
                                : 'bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                }`}
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="rounded-[1.75rem] border border-slate-100 bg-white/70 p-5">
                      <Skeleton active paragraph={{ rows: 2 }} title={{ width: '45%' }} />
                    </div>
                  ))
                ) : filteredMeetings.length === 0 ? (
                  <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50/80 py-20">
                    <Empty
                      description={hasActiveFilters
                        ? t('portalMeetings.emptyFiltered', '没有符合筛选条件的会议')
                        : t('portalMeetings.empty', '今天还没有会议安排')}
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                  </div>
                ) : (
                  filteredMeetings.map((meeting) => (
                    <button
                      key={meeting.meetingId}
                      type="button"
                      onClick={() => openMeetingDetail(meeting.meetingId)}
                      className="group w-full rounded-[1.75rem] border border-white/50 bg-white/70 p-5 text-left shadow-lg shadow-slate-200/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-100 dark:bg-slate-800/60 dark:shadow-none dark:focus:ring-blue-500/10"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 flex-wrap items-center gap-3">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                              <CalendarClock size={18} />
                            </span>
                            <div className="min-w-0">
                              <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                                {meeting.subject}
                              </h3>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${statusStyles(meeting)}`}>
                                  {statusLabel(meeting)}
                                </span>
                                <Tag color={meeting.meetingType === 'online' ? 'blue' : 'gold'}>
                                  {meeting.meetingType === 'online'
                                    ? t('portalMeetings.types.online', '线上')
                                    : t('portalMeetings.types.offline', '线下')}
                                </Tag>
                                <span className="text-[11px] font-bold text-slate-400">
                                  {meeting.meetingType === 'online'
                                    ? t('portalMeetings.labels.meetingIdOrLink', '会议 ID / 链接')
                                    : t('portalMeetings.labels.meetingIdShort', 'ID')}
                                  : {meeting.meetingId}
                                </span>
                              </div>
                            </div>
                            </div>
                            <span className="shrink-0 pt-1 text-[11px] font-black uppercase tracking-[0.14em] text-blue-500 transition group-hover:text-blue-600">
                              {t('portalMeetings.actions.viewDetail', '查看详情')}
                            </span>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                              <Clock3 size={15} className="text-slate-400" />
                              <span>{dayjs(meeting.startTime).format('HH:mm')}</span>
                              <span className="text-slate-300">/</span>
                              <span>{t('portalMeetings.duration', '{{count}} 分钟', { count: meeting.durationMinutes })}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                              {meeting.meetingType === 'online' ? (
                                <Monitor size={15} className="text-slate-400" />
                              ) : (
                                <MapPin size={15} className="text-slate-400" />
                              )}
                              <span className="truncate">{resolveMeetingVenue(meeting)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="mica rounded-[2rem] border border-white/50 p-6 shadow-xl shadow-slate-200/20 dark:shadow-none">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              {t('portalMeetings.sections.nextMeeting', '下一场')}
            </div>
            {meetingLicenseBlocked ? (
              <div className="mt-4 rounded-[1.5rem] bg-amber-50 px-4 py-6 text-sm text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
                {meetingLicenseBlockedMessage || t('portalMeetings.licenseBlocked')}
              </div>
            ) : nextMeeting ? (
              <button
                type="button"
                onClick={() => openMeetingDetail(nextMeeting.meetingId)}
                className="mt-4 block w-full space-y-4 rounded-[1.75rem] text-left transition hover:bg-slate-50/60 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:hover:bg-slate-800/50 dark:focus:ring-blue-500/10"
              >
                <div>
                  <div className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                    {dayjs(nextMeeting.startTime).format('HH:mm')}
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-300">
                    {dayjs(nextMeeting.startTime).format('YYYY-MM-DD')}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                    {nextMeeting.subject}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {nextMeeting.meetingType === 'online'
                      ? t('portalMeetings.next.onlineHint', '线上会议，请提前准备入会链接与设备。')
                      : t('portalMeetings.next.offlineHint', '线下会议，请预留到场时间并确认会议室。')}
                  </p>
                  <div className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-blue-500">
                    {t('portalMeetings.actions.viewDetail', '查看详情')}
                  </div>
                </div>
                <div className="rounded-[1.5rem] bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                  {resolveMeetingVenue(nextMeeting)}
                </div>
              </button>
            ) : (
              <div className="mt-4 rounded-[1.5rem] bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-300">
                {hasActiveFilters
                  ? t('portalMeetings.next.filteredEmpty', '当前筛选条件下没有待开始的会议。')
                  : t('portalMeetings.next.empty', '今天没有待开始的会议。')}
              </div>
            )}
          </section>
        </aside>
      </div>

      <Drawer
        title={selectedMeeting ? selectedMeeting.subject : t('portalMeetings.drawer.title', '会议详情')}
        placement="right"
        width={460}
        open={Boolean(selectedMeeting)}
        onClose={closeMeetingDetail}
        classNames={{
          body: '!bg-slate-50 dark:!bg-slate-950',
          header: '!border-b !border-slate-100 dark:!border-slate-800',
        }}
      >
        {selectedMeeting ? (
          <div className="space-y-5">
            <section className="rounded-[1.5rem] border border-white/60 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${statusStyles(selectedMeeting)}`}>
                  {statusLabel(selectedMeeting)}
                </span>
                <Tag color={selectedMeeting.meetingType === 'online' ? 'blue' : 'gold'}>
                  {selectedMeeting.meetingType === 'online'
                    ? t('portalMeetings.types.online', '线上')
                    : t('portalMeetings.types.offline', '线下')}
                </Tag>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {t('portalMeetings.drawer.startTime', '开始时间')}
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {dayjs(selectedMeeting.startTime).format('YYYY-MM-DD HH:mm')}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {t('portalMeetings.drawer.duration', '会议时长')}
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {t('portalMeetings.duration', '{{count}} 分钟', { count: selectedMeeting.durationMinutes })}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {selectedMeeting.meetingType === 'online'
                      ? t('portalMeetings.drawer.meetingSoftware', '会议软件')
                      : t('portalMeetings.drawer.room', '会议室')}
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {resolveMeetingVenue(selectedMeeting)}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {selectedMeeting.meetingType === 'online'
                      ? t('portalMeetings.drawer.onlineMeetingId', '会议 ID / 会议链接')
                      : t('portalMeetings.drawer.meetingId', '会议 ID')}
                  </div>
                  <div className="mt-2 break-all text-sm font-bold text-slate-800 dark:text-slate-100">
                    {selectedMeeting.meetingId}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-white/60 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                {t('portalMeetings.organizer', '发起人')}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-base font-black text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                  {selectedMeeting.organizer.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">{selectedMeeting.organizer}</div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t('portalMeetings.drawer.organizerHint', '会议发起人与议程所有者')}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-white/60 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {t('portalMeetings.attendees', '参会人')}
                </div>
                <div className="text-xs font-bold text-slate-400">
                  {t('portalMeetings.drawer.attendeeCount', '{{count}} 人', { count: selectedMeeting.attendees.length })}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedMeeting.attendees.length > 0 ? selectedMeeting.attendees.map((attendee) => (
                  <span
                    key={`${selectedMeeting.meetingId}-${attendee}`}
                    className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {attendee}
                  </span>
                )) : (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {t('portalMeetings.drawer.noAttendees', '当前会议还没有参会人信息')}
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={createModalOpen}
        title={t('portalMeetings.modal.title', '创建会议')}
        okText={t('portalMeetings.actions.create', '创建会议')}
        cancelText={t('common.buttons.cancel', '取消')}
        confirmLoading={creating}
        onOk={() => {
          void handleCreateMeeting().catch(() => undefined);
        }}
        onCancel={closeCreateMeetingModal}
        destroyOnHidden
      >
        <p className="mb-5 text-sm text-slate-500">
          {t('portalMeetings.modal.tip', '请手动填写会议 ID，例如腾讯会议、飞书会议等平台生成的入会编号。')}
        </p>
        <Form<PortalMeetingFormValues> form={form} layout="vertical">
          <Form.Item
            name="subject"
            label={t('portalMeetings.form.subject', '会议主题')}
            rules={[{ required: true, message: t('portalMeetings.validation.subject', '请输入会议主题') }]}
          >
            <Input placeholder={t('portalMeetings.form.subjectPlaceholder', '例如：产品周会 / 项目复盘')} />
          </Form.Item>
          <div className="grid gap-4 md:grid-cols-2">
            <Form.Item
              name="startTime"
              label={t('portalMeetings.form.startTime', '开始时间')}
              rules={[{ required: true, message: t('portalMeetings.validation.startTime', '请选择开始时间') }]}
            >
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                className="w-full"
                placeholder={t('portalMeetings.form.startTimePlaceholder', '选择会议开始时间')}
              />
            </Form.Item>
            <Form.Item
              name="durationMinutes"
              label={t('portalMeetings.form.duration', '会议时长（分钟）')}
              rules={[{ required: true, message: t('portalMeetings.validation.duration', '请输入会议时长') }]}
            >
              <InputNumber min={15} max={1440} step={15} className="w-full" />
            </Form.Item>
            <Form.Item
              name="meetingType"
              label={t('portalMeetings.form.meetingType', '会议类型')}
              rules={[{ required: true, message: t('portalMeetings.validation.meetingType', '请选择会议类型') }]}
            >
              <Select
                options={[
                  { value: 'online', label: t('portalMeetings.types.online', '线上') },
                  { value: 'offline', label: t('portalMeetings.types.offline', '线下') },
                ]}
                placeholder={t('portalMeetings.form.meetingTypePlaceholder', '选择会议类型')}
              />
            </Form.Item>
            <Form.Item
              name={isOnlineMeeting ? 'meetingSoftware' : 'meetingRoom'}
              label={createMeetingVenueLabel}
              rules={[{ required: true, message: createMeetingVenueValidation }]}
            >
              <Input placeholder={createMeetingVenuePlaceholder} />
            </Form.Item>
          </div>
          <Form.Item
            name="meetingId"
            label={createMeetingIdLabel}
            rules={[{ required: true, message: createMeetingIdValidation }]}
          >
            <Input placeholder={createMeetingIdPlaceholder} />
          </Form.Item>
          <Form.Item
            name="attendees"
            label={t('portalMeetings.form.attendees', '参会人')}
            rules={[{ required: true, type: 'array', min: 1, message: t('portalMeetings.validation.attendees', '请至少填写一位参会人') }]}
          >
            <Select
              mode="tags"
              tokenSeparators={[',', '，', ';', '；']}
              placeholder={t('portalMeetings.form.attendeesPlaceholder', '输入姓名后回车，可连续添加多位参会人')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MeetingsPage;
