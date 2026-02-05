export type Resource = {
  ID: number;
  id?: number;
  course_id: number;
  chapter_id?: number | null;
  created_by_id?: number;
  title?: string;
  name?: string;
  type?: 'video' | 'paper' | 'link' | string;
  url?: string;
  description?: string;
  file_url?: string;
  file_type?: string;
  file_size?: number;
  CreatedAt?: string;
  UpdatedAt?: string;
};

export type CreateResourceRequest = {
  course_id: number;
  title: string;
  type: 'video' | 'paper' | 'link';
  url: string;
  description?: string;
};
