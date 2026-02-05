/**
 * Attendance API types and client bindings.
 */
import { api } from '@/lib/api-client';
import type {
    ActiveSession,
    AttendanceSummary,
    SessionListItem,
    AttendanceRecord,
    CheckinResponse,
} from '@classplatform/shared';

/** Attendance-related payload types. */
export type { ActiveSession, AttendanceSummary, SessionListItem, AttendanceRecord, CheckinResponse };
/** Typed attendance API client. */
export const attendanceApi = api.attendance;
