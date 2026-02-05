export type Assignment = {
  ID: number;
  id?: number;
  course_id: number;
  chapter_id?: number | null;
  teacher_id?: number;
  title: string;
  description?: string;
  deadline?: string | null;
  due_date?: string;
  allow_file?: boolean;
  max_file_size?: number;
  max_score?: number;
  status?: 'pending' | 'submitted' | 'graded';
  submission?: AssignmentSubmission;
  CreatedAt?: string;
  UpdatedAt?: string;
};

export type AssignmentSubmission = {
  ID: number;
  id?: number;
  assignment_id: number;
  student_id: number;
  content?: string;
  file_url?: string | null;
  grade?: number | null;
  score?: number;
  feedback?: string | null;
  graded_by?: number | null;
  submitted_at?: string;
  graded_at?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
};

export type CreateAssignmentRequest = {
  course_id: number;
  title: string;
  description?: string;
  deadline?: string;
  allow_file?: boolean;
};

export type SubmitAssignmentRequest = {
  content?: string;
  file_url?: string;
};

export type GradeSubmissionRequest = {
  grade: number;
  feedback?: string;
};

export type AssignmentDetailedStats = {
  total_students: number;
  submitted_count: number;
  graded_count: number;
  average_grade: number;
  highest_grade: number;
  lowest_grade: number;
};

export type CourseAssignmentStats = {
  total_assignments: number;
  pending_count: number;
  submitted_count: number;
  average_grade: number;
};
