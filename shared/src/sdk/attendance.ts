import type { ApiClient } from './http';
import type {
  ActiveSession,
  AttendanceSummary,
  SessionListItem,
  AttendanceRecord,
  CheckinResponse,
  StartAttendanceSessionRequest,
  AttendanceCheckinRequest,
} from '../types';

export function createAttendanceApi(client: ApiClient) {
  return {
    getSummary: (courseId: number) =>
      client.get<AttendanceSummary>(`/courses/${courseId}/attendance/summary`),
    listSessions: (courseId: number) =>
      client.get<SessionListItem[]>(`/courses/${courseId}/attendance/sessions`),
    startSession: (courseId: number, payload: StartAttendanceSessionRequest) =>
      client.post<ActiveSession>(`/courses/${courseId}/attendance/start`, payload),
    endSession: (sessionId: number) => client.post<void>(`/attendance/${sessionId}/end`, {}),
    checkin: (sessionId: number, payload: AttendanceCheckinRequest) =>
      client.post<CheckinResponse>(`/attendance/${sessionId}/checkin`, payload),
    getRecords: (sessionId: number) => client.get<AttendanceRecord[]>(`/attendance/${sessionId}/records`),
  };
}
