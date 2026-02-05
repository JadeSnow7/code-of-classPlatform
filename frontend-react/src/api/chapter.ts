/**
 * Chapter API types and client bindings.
 */
import { api } from '@/lib/api-client';
import type {
    Chapter,
    ChapterStudentStats,
    AssignmentStats,
    QuizStats,
    Resource,
} from '@classplatform/shared';

/** Chapter-related payload types. */
export type { Chapter, ChapterStudentStats, AssignmentStats, QuizStats, Resource };
/** Typed chapter API client. */
export const chapterApi = api.chapter;
