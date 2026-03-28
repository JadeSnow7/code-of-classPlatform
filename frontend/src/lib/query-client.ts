import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api-client';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry(failureCount, error) {
                if (error instanceof ApiRequestError && error.httpStatus && error.httpStatus >= 400 && error.httpStatus < 500 && error.httpStatus !== 429) {
                    return false;
                }
                return failureCount < 2;
            },
            staleTime: 30_000,
            refetchOnWindowFocus: false,
        },
        mutations: {
            retry: false,
        },
    },
});
