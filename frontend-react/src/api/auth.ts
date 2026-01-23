import { apiClient } from '@/lib/api-client';
import { authStore, type User } from '@/lib/auth-store';

export interface LoginResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

export const authApi = {
    async login(username: string, password: string): Promise<User> {
        // Clear any existing token before attempting login
        authStore.clearToken();

        const response = await apiClient.post<LoginResponse>('/auth/login', {
            username,
            password,
        });

        // Response interceptor unwraps data, so response.data might be the LoginResponse object directly
        // or axios response. We need to be careful. 
        // Our api-client interceptor unwraps { data: ... } but Login response is { access_token: ... } directly usually?
        // Let's check backend. Backend returns JSON { access_token... } directly.
        // The interceptor checks if response.data.data exists. 
        // Backend login returns { access_token: ... }. No .data wrapper. 
        // So `response.data` is the object.

        const data = response.data;
        authStore.setToken(data.access_token);

        const user = authStore.getUser();
        if (!user) throw new Error('Invalid token received');

        return user;
    },

    async me(): Promise<User> {
        // Backend returns User object directly? 
        // Or wrapped? 
        // Based on previous logs: GET /api/v1/auth/me returns 200.
        // Let's assume standard response.
        await apiClient.get<User>('/auth/me');
        // We verify token validity by this call.
        // We trust authStore's decoding for UI, but this ensures token is valid on server.
        const user = authStore.getUser();
        if (!user) throw new Error('No user in storage');
        return user;
    },

    async wecomLogin(code: string): Promise<User> {
        // Clear any existing token
        authStore.clearToken();

        const response = await apiClient.post<LoginResponse>('/auth/wecom', { code });
        const data = response.data;
        authStore.setToken(data.access_token);

        const user = authStore.getUser();
        if (!user) throw new Error('Invalid token received from WeChat Work');

        return user;
    },

    logout() {
        authStore.clearToken();
    }
};
