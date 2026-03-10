import dayjs from 'dayjs';

import ApiClient, {
  type PortalMeetingCreatePayload,
  type PortalMeetingListItemDTO,
  type PortalTodayMeetingSummaryDTO,
  type PortalTodayMeetingSummaryParams,
} from '@/shared/services/api';

export interface PortalMeetingSummaryItem {
  subject: string;
  startTime: string;
  durationMinutes: number;
  meetingType: 'online' | 'offline';
  meetingRoom: string;
  meetingSoftware: string;
  meetingId: string;
  organizer: string;
}

export interface PortalMeetingListItem extends PortalMeetingSummaryItem {
  attendees: string[];
}

export interface PortalTodayMeetingSummary {
  date: string;
  total: number;
  nextMeeting: PortalMeetingSummaryItem | null;
}

export interface CreatePortalMeetingInput {
  subject: string;
  startTime: string;
  durationMinutes: number;
  meetingType: 'online' | 'offline';
  meetingRoom: string;
  meetingSoftware: string;
  meetingId: string;
  attendees: string[];
}

const buildEmptyTodaySummary = (): PortalTodayMeetingSummary => ({
  date: dayjs().format('YYYY-MM-DD'),
  total: 0,
  nextMeeting: null,
});

const mapTodaySummary = (payload: PortalTodayMeetingSummaryDTO): PortalTodayMeetingSummary => ({
  date: payload.date,
  total: payload.total,
  nextMeeting: payload.next_meeting
    ? {
        subject: payload.next_meeting.subject,
        startTime: payload.next_meeting.start_time,
        durationMinutes: payload.next_meeting.duration_minutes,
        meetingType: payload.next_meeting.meeting_type,
        meetingRoom: payload.next_meeting.meeting_room ?? '',
        meetingSoftware: payload.next_meeting.meeting_software ?? '',
        meetingId: payload.next_meeting.meeting_id,
        organizer: payload.next_meeting.organizer,
      }
    : null,
});

const mapMeetingListItem = (payload: PortalMeetingListItemDTO): PortalMeetingListItem => ({
  subject: payload.subject,
  startTime: payload.start_time,
  durationMinutes: payload.duration_minutes,
  meetingType: payload.meeting_type,
  meetingRoom: payload.meeting_room ?? '',
  meetingSoftware: payload.meeting_software ?? '',
  meetingId: payload.meeting_id,
  organizer: payload.organizer,
  attendees: payload.attendees,
});

class PortalMeetingService {
  buildTodayWindowQuery(now = dayjs()): PortalTodayMeetingSummaryParams {
    return {
      start_from: now.startOf('day').toISOString(),
      start_to: now.startOf('day').add(1, 'day').toISOString(),
    };
  }

  buildTodaySummaryQuery(now = dayjs()): PortalTodayMeetingSummaryParams {
    return {
      ...this.buildTodayWindowQuery(now),
      current_time: now.toISOString(),
    };
  }

  async getTodaySummary(now = dayjs()): Promise<PortalTodayMeetingSummary> {
    const params = this.buildTodaySummaryQuery(now);
    const summary = await ApiClient.getPortalTodayMeetingSummary(params);
    return mapTodaySummary(summary);
  }

  async listTodayMeetings(now = dayjs()): Promise<PortalMeetingListItem[]> {
    const meetings = await ApiClient.getPortalMeetings(this.buildTodayWindowQuery(now));
    return meetings.map(mapMeetingListItem);
  }

  async createMeeting(input: CreatePortalMeetingInput): Promise<PortalMeetingListItem> {
    const payload: PortalMeetingCreatePayload = {
      subject: input.subject,
      start_time: input.startTime,
      duration_minutes: input.durationMinutes,
      meeting_type: input.meetingType,
      meeting_room: input.meetingType === 'offline' ? input.meetingRoom.trim() : undefined,
      meeting_software: input.meetingType === 'online' ? input.meetingSoftware.trim() : undefined,
      meeting_id: input.meetingId.trim(),
      attendees: input.attendees,
    };
    const meeting = await ApiClient.createPortalMeeting(payload);
    return mapMeetingListItem(meeting);
  }

  getEmptyTodaySummary(): PortalTodayMeetingSummary {
    return buildEmptyTodaySummary();
  }
}

const portalMeetingService = new PortalMeetingService();

export default portalMeetingService;
