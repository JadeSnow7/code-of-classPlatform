/**
 * Auth API helpers wrapping the shared client with local storage.
 */
import { api } from '@/lib/api-client';
import { authStore, type User } from '@/lib/auth-store';
import type { InvitePreview, LoginResponse, MeResponse } from '@classplatform/shared';

function normalizeRole(role: string): User['role'] {
    if (role === 'admin' || role === 'teacher' || role === 'assistant' || role === 'student') {
        return role;
    }
    return 'student';
}

function toUser(profile: MeResponse): User {
    return {
        id: String(profile.id),
        name: profile.name ?? profile.username,
        role: normalizeRole(profile.role),
        permissions: profile.permissions ?? [],
    };
}

function persistSession(data: LoginResponse) {
    authStore.setSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type ?? 'Bearer',
        expiresIn: data.expires_in,
        refreshExpiresIn: data.refresh_expires_in,
    });
}

export const authApi = {
    async login(username: string, password: string): Promise<User> {
        authStore.clearToken();
        const data = await api.auth.login(username, password);
        persistSession(data);
        const profile = await api.auth.me();
        const user = toUser(profile);
        authStore.setProfile(user);
        return user;
    },

    async activateRegistration(token: string, password: string, confirmPassword: string): Promise<User> {
        authStore.clearToken();
        const data = await api.auth.activateRegistration({
            token,
            password,
            confirm_password: confirmPassword,
        });
        persistSession(data);
        const profile = await api.auth.me();
        const user = toUser(profile);
        authStore.setProfile(user);
        return user;
    },

    async getInvite(token: string): Promise<InvitePreview> {
        return api.auth.getInvite(token);
    },

    async refresh(): Promise<string | null> {
        const refreshToken = authStore.getRefreshToken();
        if (!refreshToken) {
            return null;
        }
        const data = await api.auth.refresh(refreshToken);
        persistSession(data);
        return data.access_token;
    },

    async me(): Promise<User> {
        const profile = await api.auth.me();
        const user = toUser(profile);
        authStore.setProfile(user);
        return user;
    },

    async wecomLogin(code: string): Promise<User> {
        authStore.clearToken();
        const data = await api.auth.wecomLogin(code);
        persistSession(data);
        const profile = await api.auth.me();
        const user = toUser(profile);
        authStore.setProfile(user);
        return user;
    },

    async logout(): Promise<void> {
        const refreshToken = authStore.getRefreshToken();
        try {
            if (refreshToken) {
                await api.auth.logout(refreshToken);
            }
        } finally {
            authStore.clearToken();
        }
    }
};
