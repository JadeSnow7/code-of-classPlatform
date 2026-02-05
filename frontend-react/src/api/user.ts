/**
 * User API types and client bindings.
 */
import { api } from '@/lib/api-client';
import type { Activity, PendingItem, StudentStats, TeacherStats, UserStats } from '@classplatform/shared';

/** User-related payload types. */
export type { Activity, PendingItem, StudentStats, TeacherStats, UserStats };
/** Typed user API client. */
export const userApi = api.user;
