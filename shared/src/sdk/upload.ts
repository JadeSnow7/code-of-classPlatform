import type { ApiClient, UploadRequest } from './http';

export type UploadResponse = {
  signed_url: string;
  filename: string;
};

export function createUploadApi(client: ApiClient) {
  return {
    uploadAssignmentFile: (assignmentId: number, file: UploadRequest['file'], onProgress?: UploadRequest['onProgress']) =>
      client.upload<UploadResponse>(`/upload/assignment/${assignmentId}`, {
        file,
        onProgress,
      }),
    uploadResourceFile: (courseId: number, file: UploadRequest['file'], onProgress?: UploadRequest['onProgress']) =>
      client.upload<UploadResponse>(`/upload/resource/${courseId}`, {
        file,
        onProgress,
      }),
  };
}
