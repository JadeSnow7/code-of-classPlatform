export type Resource = {
    ID: number;
    course_id: number;
    chapter_id?: number | null;
    created_by_id: number;
    title: string;
    type: 'video' | 'paper' | 'link';
    url: string;
    description?: string;
    CreatedAt?: string;
    UpdatedAt?: string;
};

export type CreateResourceRequest = {
    course_id: number;
    title: string;
    type: 'video' | 'paper' | 'link';
    url: string;
    description?: string;
};
