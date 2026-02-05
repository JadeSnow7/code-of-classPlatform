export * from './http';
export * from './auth';
export * from './ai';
export * from './course';
export * from './chapter';
export * from './assignment';
export * from './quiz';
export * from './resource';
export * from './announcement';
export * from './attendance';
export * from './user';
export * from './upload';
export * from './student';

import type { ApiClientConfig } from './http';
import { createApiClient } from './http';
import { createAuthApi } from './auth';
import { createAiApi } from './ai';
import { createCourseApi } from './course';
import { createChapterApi } from './chapter';
import { createAssignmentApi } from './assignment';
import { createQuizApi } from './quiz';
import { createResourceApi } from './resource';
import { createAnnouncementApi } from './announcement';
import { createAttendanceApi } from './attendance';
import { createUserApi } from './user';
import { createUploadApi } from './upload';
import { createStudentApi } from './student';

export function createApi(config: ApiClientConfig) {
  const client = createApiClient(config);
  return {
    client,
    auth: createAuthApi(client),
    ai: createAiApi(client),
    course: createCourseApi(client),
    chapter: createChapterApi(client),
    assignment: createAssignmentApi(client),
    quiz: createQuizApi(client),
    resource: createResourceApi(client),
    announcement: createAnnouncementApi(client),
    attendance: createAttendanceApi(client),
    user: createUserApi(client),
    upload: createUploadApi(client),
    student: createStudentApi(client),
  };
}
