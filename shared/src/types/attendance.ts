export type ActiveSession = {
  id: number;
  code: string;
  ends_at: string;
};

export type AttendanceSummary = {
  attendance_rate: number;
  sessions_count: number;
  last_session_at: string | null;
  active_session: ActiveSession | null;
};

export type SessionListItem = {
  id: number;
  start_at: string;
  end_at: string;
  is_active: boolean;
  attendee_count: number;
};

export type AttendanceRecord = {
  student_id: number;
  student_name: string;
  checked_in_at: string;
  ip_address: string;
};

export type CheckinResponse = {
  success: boolean;
  already_checked_in?: boolean;
  checked_in_at: string;
};
