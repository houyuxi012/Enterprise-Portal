import ApiClient, {
  type AdminMeetingCreatePayload,
  type AdminMeetingDTO,
  type AdminMeetingListResponseDTO,
  type AdminMeetingListParams,
} from '@/shared/services/api';
import type { UserOption } from '@/types';

export type MeetingType = 'online' | 'offline';
export type MeetingStatus = 'upcoming' | 'inProgress' | 'finished';

export interface LocalMeetingRecord {
  id: number;
  subject: string;
  startTime: string;
  durationMinutes: number;
  meetingType: MeetingType;
  meetingRoom: string;
  meetingSoftware: string;
  meetingId: string;
  organizer: string;
  organizerUserId?: number | null;
  organizerUser?: UserOption | null;
  attendees: string[];
  attendeeUserIds: number[];
  attendeeUsers: UserOption[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocalMeetingInput {
  subject: string;
  startTime: string;
  durationMinutes: number;
  meetingType: MeetingType;
  meetingRoom: string;
  meetingSoftware: string;
  meetingId: string;
  organizerUserId: number;
  attendeeUserIds: number[];
}

export interface ListMeetingFilters {
  q?: string;
  meetingType?: MeetingType;
  startFrom?: string;
  startTo?: string;
  organizerUserId?: number;
  attendeeUserId?: number;
  status?: MeetingStatus;
  limit?: number;
  offset?: number;
}

export interface PaginatedMeetingSummary {
  total: number;
  upcoming: number;
  online: number;
  offline: number;
}

export interface PaginatedMeetingResult {
  total: number;
  limit: number;
  offset: number;
  items: LocalMeetingRecord[];
  summary: PaginatedMeetingSummary;
}

const mapMeetingRecord = (record: AdminMeetingDTO): LocalMeetingRecord => ({
  id: record.id,
  subject: record.subject,
  startTime: record.start_time,
  durationMinutes: record.duration_minutes,
  meetingType: record.meeting_type,
  meetingRoom: record.meeting_room ?? '',
  meetingSoftware: record.meeting_software ?? '',
  meetingId: record.meeting_id,
  organizer: record.organizer,
  organizerUserId: record.organizer_user_id,
  organizerUser: record.organizer_user
    ? {
      id: record.organizer_user.id,
      username: record.organizer_user.username,
      name: record.organizer_user.name ?? undefined,
    }
    : null,
  attendees: record.attendees,
  attendeeUserIds: record.attendee_user_ids || [],
  attendeeUsers: (record.attendee_users || []).map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name ?? undefined,
  })),
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

const mapCreatePayload = (input: CreateLocalMeetingInput): AdminMeetingCreatePayload => ({
  subject: input.subject.trim(),
  start_time: input.startTime,
  duration_minutes: input.durationMinutes,
  meeting_type: input.meetingType,
  meeting_room: input.meetingType === 'offline' ? input.meetingRoom.trim() : undefined,
  meeting_software: input.meetingType === 'online' ? input.meetingSoftware.trim() : undefined,
  meeting_id: input.meetingId.trim(),
  organizer_user_id: input.organizerUserId,
  attendee_user_ids: input.attendeeUserIds,
});

const mapListParams = (filters?: ListMeetingFilters): AdminMeetingListParams | undefined => {
  if (!filters) {
    return undefined;
  }

  return {
    q: filters.q?.trim() || undefined,
    meeting_type: filters.meetingType,
    start_from: filters.startFrom,
    start_to: filters.startTo,
    organizer_user_id: filters.organizerUserId,
    attendee_user_id: filters.attendeeUserId,
    status: filters.status,
    limit: filters.limit,
    offset: filters.offset,
  };
};

const mapPaginatedMeetings = (payload: AdminMeetingListResponseDTO): PaginatedMeetingResult => ({
  total: payload.total,
  limit: payload.limit,
  offset: payload.offset,
  items: payload.items.map(mapMeetingRecord),
  summary: {
    total: payload.summary?.total ?? payload.total,
    upcoming: payload.summary?.upcoming ?? 0,
    online: payload.summary?.online ?? 0,
    offline: payload.summary?.offline ?? 0,
  },
});

class MeetingService {
  async listMeetings(filters?: ListMeetingFilters): Promise<PaginatedMeetingResult> {
    const meetings = await ApiClient.getAdminMeetings(mapListParams(filters));
    return mapPaginatedMeetings(meetings);
  }

  async createMeeting(input: CreateLocalMeetingInput): Promise<LocalMeetingRecord> {
    const record = await ApiClient.createAdminMeeting(mapCreatePayload(input));
    return mapMeetingRecord(record);
  }

  async updateMeeting(id: number, input: CreateLocalMeetingInput): Promise<LocalMeetingRecord> {
    const record = await ApiClient.updateAdminMeeting(id, mapCreatePayload(input));
    return mapMeetingRecord(record);
  }

  async deleteMeeting(id: number): Promise<void> {
    await ApiClient.deleteAdminMeeting(id);
  }
}

const meetingService = new MeetingService();

export default meetingService;
