/**
 * Resource API types and client bindings.
 */
import { api } from '@/lib/api-client';
import type { Resource, CreateResourceRequest } from '@classplatform/shared';

/** Resource-related payload types. */
export type { Resource, CreateResourceRequest };
/** Typed resource API client. */
export const resourceApi = api.resource;
