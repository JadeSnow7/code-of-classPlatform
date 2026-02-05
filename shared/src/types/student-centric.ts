export type DimensionScore = {
  name: string;
  score: number;
  weight: number;
  comment: string;
};

export type WritingFeedback = {
  overall_score: number;
  dimensions: DimensionScore[];
  strengths: string[];
  improvements: string[];
  summary: string;
  raw_feedback: string;
  word_count: number;
  writing_type: string;
};

export type WritingType = 'literature_review' | 'course_paper' | 'thesis' | 'abstract';

export type WritingSubmission = {
  ID?: number;
  id: number;
  student_id: number;
  course_id: number;
  assignment_id?: number | null;
  writing_type: WritingType;
  title: string;
  content: string;
  word_count: number;
  feedback_json?: string;
  dimension_json?: string;
  created_at: string;
  updated_at?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
  feedback?: WritingFeedback;
};

export type LearningEvent = {
  ID?: number;
  id?: number;
  student_id: number;
  course_id?: number;
  event_type: string;
  payload: string;
  created_at?: string;
  CreatedAt?: string;
};

export type StudentGlobalProfile = {
  user_id?: number;
  student_id?: number;
  learning_style: string;
  competencies_json?: string;
  global_competencies?: string;
  total_study_minutes?: number;
  total_study_hours?: number;
  last_active_at?: string;
  updated_at?: string;
  competencies?: Record<string, number>;
};
