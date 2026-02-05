import type { ApiClient } from './http';
import type { ActiveSession, AttendanceSummary, SessionListItem, AttendanceRecord, CheckinResponse } from '../types';

export function createAttendanceApi(client: ApiClient) {
  return {
    getSummary: (courseId: number) =>
      client.get<AttendanceSummary>(`/courses/${courseId}/attendance/summary`),
    listSessions: (courseId: number) =>
      client.get<SessionListItem[]>(`/courses/${courseId}/attendance/sessions`),
    startSession: (courseId: number, timeoutMinutes = 15) =>
      client.post<ActiveSession>(`/courses/${courseId}/attendance/start`, { timeout_minutes: timeoutMinutes }),
    endSession: (sessionId: number) => client.post<void>(`/attendance/${sessionId}/end`, {}),
    checkin: (sessionId: number, code: string) =>
      client.post<CheckinResponse>(`/attendance/${sessionId}/checkin`, { code }),
    getRecords: (sessionId: number) => client.get<AttendanceRecord[]>(`/attendance/${sessionId}/records`),
  };
}
