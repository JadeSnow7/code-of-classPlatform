/**
 * Assignment API types and client bindings.
 */
import { api } from '@/lib/api-client';
import type {
    Assignment,
    AssignmentSubmission,
    CreateAssignmentRequest,
    SubmitAssignmentRequest,
    GradeSubmissionRequest,
    AssignmentDetailedStats,
    CourseAssignmentStats,
} from '@classplatform/shared';

/** Assignment-related payload types. */
export type { Assignment, AssignmentSubmission, CreateAssignmentRequest, AssignmentDetailedStats, CourseAssignmentStats };
/** Submission payload alias for convenience. */
export type Submission = AssignmentSubmission;
/** Submission request payload alias for convenience. */
export type SubmitRequest = SubmitAssignmentRequest;
/** Grade request payload alias for convenience. */
export type GradeRequest = GradeSubmissionRequest;

/** Typed assignment API client. */
export const assignmentApi = api.assignment;
