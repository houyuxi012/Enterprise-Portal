import ApiClient, {
  type AdminMeetingCreatePayload,
  type AdminMeetingDTO,
  type AdminMeetingListParams,
} from '@/shared/services/api';

export type MeetingType = 'online' | 'offline';

export interface LocalMeetingRecord {
  id: number;
  subject: string;
  startTime: string;
  durationMinutes: number;
  meetingType: MeetingType;
  meetingRoom: string;
  meetingId: string;
  organizer: string;
  attendees: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocalMeetingInput {
  subject: string;
  startTime: string;
  durationMinutes: number;
  meetingType: MeetingType;
  meetingRoom: string;
  meetingId?: string;
  organizer: string;
  attendees: string[];
}

export interface ListMeetingFilters {
  q?: string;
  meetingType?: MeetingType;
  startFrom?: string;
  startTo?: string;
}

const mapMeetingRecord = (record: AdminMeetingDTO): LocalMeetingRecord => ({
  id: record.id,
  subject: record.subject,
  startTime: record.start_time,
  durationMinutes: record.duration_minutes,
  meetingType: record.meeting_type,
  meetingRoom: record.meeting_room,
  meetingId: record.meeting_id,
  organizer: record.organizer,
  attendees: record.attendees,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

const mapCreatePayload = (input: CreateLocalMeetingInput): AdminMeetingCreatePayload => ({
  subject: input.subject.trim(),
  start_time: input.startTime,
  duration_minutes: input.durationMinutes,
  meeting_type: input.meetingType,
  meeting_room: input.meetingRoom.trim(),
  meeting_id: input.meetingId?.trim() || undefined,
  organizer: input.organizer.trim(),
  attendees: input.attendees.map((item) => item.trim()).filter(Boolean),
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
  };
};

class MeetingService {
  async listMeetings(filters?: ListMeetingFilters): Promise<LocalMeetingRecord[]> {
    const meetings = await ApiClient.getAdminMeetings(mapListParams(filters));
    return meetings.map(mapMeetingRecord);
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
