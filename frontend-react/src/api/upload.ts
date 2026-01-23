import { apiClient } from '@/lib/api-client';

export interface UploadResponse {
    signed_url: string;
    filename: string;
}

export const uploadApi = {
    /**
     * Upload a file for assignment submission
     * @param assignmentId - The assignment ID
     * @param file - The file to upload
     * @param onProgress - Optional progress callback (0-100, or -1 if unknown)
     */
    uploadAssignmentFile: async (
        assignmentId: number,
        file: File,
        onProgress?: (percent: number) => void
    ): Promise<UploadResponse> => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post<UploadResponse>(
            `/upload/assignment/${assignmentId}`,
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress: (event) => {
                    // Handle case where total might be undefined
                    const percent = event.total
                        ? Math.round((event.loaded / event.total) * 100)
                        : -1; // -1 indicates unknown progress
                    onProgress?.(percent);
                },
            }
        );
        return response.data;
    },

    /**
     * Upload a file for course resources
     * @param courseId - The course ID
     * @param file - The file to upload
     * @param onProgress - Optional progress callback
     */
    uploadResourceFile: async (
        courseId: number,
        file: File,
        onProgress?: (percent: number) => void
    ): Promise<UploadResponse> => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post<UploadResponse>(
            `/upload/resource/${courseId}`,
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress: (event) => {
                    const percent = event.total
                        ? Math.round((event.loaded / event.total) * 100)
                        : -1;
                    onProgress?.(percent);
                },
            }
        );
        return response.data;
    },
};
