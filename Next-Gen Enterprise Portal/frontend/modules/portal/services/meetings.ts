import dayjs from 'dayjs';

import ApiClient, {
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
        meetingRoom: payload.next_meeting.meeting_room,
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
  meetingRoom: payload.meeting_room,
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

  getEmptyTodaySummary(): PortalTodayMeetingSummary {
    return buildEmptyTodaySummary();
  }
}

const portalMeetingService = new PortalMeetingService();

export default portalMeetingService;
