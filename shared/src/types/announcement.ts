export type Announcement = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  is_read: boolean;
};

export type AnnouncementSummary = {
  unread_count: number;
  total_count: number;
  latest: {
    id: number;
    title: string;
    created_at: string;
  } | null;
};

export type CreateAnnouncementRequest = {
  title: string;
  content: string;
};
