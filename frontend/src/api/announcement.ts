/**
 * Announcement API types and client bindings.
 */
import { api } from '@/lib/api-client';
import type { Announcement, AnnouncementSummary, CreateAnnouncementRequest } from '@classplatform/shared';

/** Announcement-related payload types. */
export type { Announcement, AnnouncementSummary, CreateAnnouncementRequest };
/** Typed announcement API client. */
export const announcementApi = api.announcement;
