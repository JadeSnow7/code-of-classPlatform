export type Activity = {
  type: 'assignment_submit' | 'quiz_submit';
  title: string;
  course_id: number;
  score?: number;
  max_score?: number;
  created_at: string;
};

export type PendingItem = {
  type: 'assignment' | 'quiz';
  id: number;
  title: string;
  course_id: number;
  deadline: string;
};

export type StudentStats = {
  courses_count: number;
  assignments_total: number;
  assignments_submitted: number;
  quizzes_taken: number;
  quizzes_avg_score: number;
  pending_count: number;
  pending: PendingItem[];
  recent_activity: Activity[];
};

export type TeacherStats = {
  courses_created: number;
  assignments_created: number;
  quizzes_created: number;
  pending_grades: number;
  recent_submissions: Activity[];
};

export type UserStats = StudentStats | TeacherStats;

export type LearningStats = {
  total_study_time_seconds: number;
  completed_chapters: number;
  total_chapters: number;
  submitted_assignments: number;
  total_assignments: number;
  completed_quizzes: number;
  total_quizzes: number;
  average_quiz_score?: number;
};
