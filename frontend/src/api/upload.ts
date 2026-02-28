/**
 * Upload API types and client bindings.
 */
import { api } from '@/lib/api-client';
import type { UploadResponse } from '@classplatform/shared';

/** Upload response payload type. */
export type { UploadResponse };
/** Typed upload API client. */
export const uploadApi = api.upload;
