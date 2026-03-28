import { api, apiClient } from '@/lib/api-client';
import { authStore, type User } from '@/lib/auth-store';
import type { ActivateRegistrationPayload } from '@/types/onboarding';

interface LoginPayload {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    user?: {
        id: string | number;
        username?: string;
        name?: string | null;
        role?: string;
        permissions?: string[];
    };
}

function normalizeRole(role: string | undefined): User['role'] {
    if (role === 'admin' || role === 'teacher' || role === 'assistant' || role === 'student') {
        return role;
    }
    return 'student';
}

function persistSession(data: LoginPayload) {
    authStore.setSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenType: 'Bearer',
        expiresIn: data.expiresIn,
    });
}

function toUser(data: LoginPayload['user']): User {
    return {
        id: String(data?.id ?? ''),
        name: data?.name ?? data?.username ?? '用户',
        role: normalizeRole(data?.role),
        permissions: data?.permissions ?? [],
    };
}

export const authApi = {
    async login(username: string, password: string): Promise<User> {
        authStore.clearToken();
        const data = await apiClient.post<LoginPayload>('/auth/login', {
            username,
            password,
        }, {
            skipAuth: true,
            suppressErrorToast: true,
        });
        persistSession(data);
        const user = data.user ? toUser(data.user) : await this.me();
        authStore.setProfile(user);
        return user;
    },

    async me(): Promise<User> {
        const data = await apiClient.get<{
            id: string | number;
            username?: string;
            name?: string | null;
            role?: string;
            permissions?: string[];
        }>('/me');
        const user = toUser(data);
        authStore.setProfile(user);
        return user;
    },

    async refresh(): Promise<string | null> {
        const refreshToken = authStore.getRefreshToken();
        if (!refreshToken) {
            return null;
        }
        const data = await apiClient.post<LoginPayload>('/auth/refresh', {
            refreshToken,
        }, {
            skipAuth: true,
            suppressErrorToast: true,
        });
        persistSession(data);
        return data.accessToken;
    },

    async logout(): Promise<void> {
        try {
            await apiClient.post<null>('/auth/logout');
        } finally {
            authStore.clearToken();
        }
    },

    async activateRegistration(payload: ActivateRegistrationPayload): Promise<User> {
        authStore.clearToken();
        const data = await api.auth.activateRegistration(payload);
        authStore.setSession({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenType: data.token_type ?? 'Bearer',
            expiresIn: data.expires_in,
            refreshExpiresIn: data.refresh_expires_in,
        });
        return this.me();
    },

    async getInvite(token: string) {
        return api.auth.getInvite(token);
    },

    async wecomLogin(code: string): Promise<User> {
        authStore.clearToken();
        const data = await api.auth.wecomLogin(code);
        authStore.setSession({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenType: data.token_type ?? 'Bearer',
            expiresIn: data.expires_in,
            refreshExpiresIn: data.refresh_expires_in,
        });
        return this.me();
    },
};

