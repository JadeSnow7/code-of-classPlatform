export type ApiSuccessCode = '0';
export type ApiBusinessCode = string;
export type ListSortOrder = 'asc' | 'desc';

export interface ApiResponse<T> {
    code: ApiSuccessCode | ApiBusinessCode;
    message: string;
    data: T | null;
    request_id: string;
    timestamp: string;
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    has_more: boolean;
}

export interface BaseListQuery {
    page?: number;
    page_size?: number;
    keyword?: string;
    sort_by?: string;
    sort_order?: ListSortOrder;
}

export interface ApiError {
    code?: string;
    message: string;
    details?: Record<string, unknown>;
    request_id?: string;
}
