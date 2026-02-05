import type { Resource } from './resource';

export type Course = {
  ID: number;
  id?: number;
  name: string;
  description?: string;
  code?: string;
  semester?: string;
  teacher_id: number;
  teacher_name?: string;
  student_count?: number;
  CreatedAt?: string;
  UpdatedAt?: string;
};

export type Chapter = {
  ID: number;
  id?: number;
  course_id: number;
  title: string;
  description?: string;
  summary?: string;
  knowledge_points?: string | string[];
  content?: string;
  order_num?: number;
  study_time_seconds?: number;
  CreatedAt?: string;
  UpdatedAt?: string;
};

export type AssignmentStats = {
  total: number;
  submitted: number;
  graded: number;
  avg_score: number;
  accuracy_rate: number;
};

export type QuizStats = {
  total: number;
  attempted: number;
  avg_score: number;
};

export type ChapterStudentStats = {
  chapter_id: number;
  study_duration_seconds: number;
  study_duration_formatted?: string;
  assignment_stats?: AssignmentStats;
  quiz_stats?: QuizStats;
  resources?: Resource[];
  knowledge_points?: string[];
};
