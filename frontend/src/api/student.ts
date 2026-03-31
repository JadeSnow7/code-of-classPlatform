import { api } from '@/lib/api-client';
import type { StudentGlobalProfile, LearningEvent } from '@classplatform/shared';

export type { StudentGlobalProfile, LearningEvent };
export const studentApi = api.student;
