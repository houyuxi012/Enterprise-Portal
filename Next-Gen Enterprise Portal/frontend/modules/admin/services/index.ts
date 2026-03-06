export { default as ApiClient } from '@/shared/services/api';
export { default as AuthService } from '@/shared/services/auth';
export { default as DirectoryService } from '@/shared/services/directory';
export { default as TodoService } from '@/shared/services/todos';
export { default as MeetingService } from './meetings';
export type { CreateLocalMeetingInput, ListMeetingFilters, LocalMeetingRecord, MeetingType } from './meetings';
