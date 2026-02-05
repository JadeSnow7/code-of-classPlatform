/**
 * Course API types and client bindings.
 */
import { api } from '@/lib/api-client';
import type { Course, CreateCourseRequest } from '@classplatform/shared';

/** Course-related payload types. */
export type { Course, CreateCourseRequest };
/** Typed course API client. */
export const courseApi = api.course;
