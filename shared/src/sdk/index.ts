export * from './http';
export * from './auth';
export * from './ai';
export * from './aiConfig';
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
export * from './dashboard';
export * from './knowledgeBase';
export * from './workspace';

import type { ApiClientConfig } from './http';
import { createApiClient } from './http';
import { createAuthApi } from './auth';
import { createAiApi } from './ai';
import { createAiConfigApi } from './aiConfig';
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
import { createDashboardApi } from './dashboard';
import { createKnowledgeBaseApi } from './knowledgeBase';
import { createWorkspaceApi } from './workspace';

export function createApi(config: ApiClientConfig) {
  const client = createApiClient(config);
  return {
    client,
    auth: createAuthApi(client),
    ai: createAiApi(client, {
      baseUrl: config.baseUrl,
      getAccessToken: config.getAccessToken,
      getTokenType: config.getTokenType,
      onUnauthorized: config.onUnauthorized,
      fetchFn: config.fetchFn,
    }),
    aiConfig: createAiConfigApi(client),
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
    dashboard: createDashboardApi(client),
    knowledgeBase: createKnowledgeBaseApi(client),
    workspace: createWorkspaceApi(client),
  };
}
