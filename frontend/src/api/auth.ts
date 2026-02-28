/**
 * Auth API helpers wrapping the shared client with local storage.
 */
import { api } from '@/lib/api-client';
import { authStore, type User } from '@/lib/auth-store';
import type { MeResponse } from '@classplatform/shared';

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

export const authApi = {
    /**
     * Authenticate with username and password.
     *
     * @param username Username or account identifier.
     * @param password Plain text password.
     * @returns The authenticated user.
     */
    async login(username: string, password: string): Promise<User> {
        authStore.clearToken();
        const data = await api.auth.login(username, password);
        authStore.setToken(data.access_token);
        const profile = await api.auth.me();
        const user = toUser(profile);
        authStore.setProfile(user);
        return user;
    },

    /**
     * Fetch the current user from the API and local storage.
     *
     * @returns The authenticated user.
     */
    async me(): Promise<User> {
        const profile = await api.auth.me();
        const user = toUser(profile);
        authStore.setProfile(user);
        return user;
    },

    /**
     * Authenticate via WeChat Work authorization code.
     *
     * @param code WeChat Work login code.
     * @returns The authenticated user.
     */
    async wecomLogin(code: string): Promise<User> {
        authStore.clearToken();
        const data = await api.auth.wecomLogin(code);
        authStore.setToken(data.access_token);
        const profile = await api.auth.me();
        const user = toUser(profile);
        authStore.setProfile(user);
        return user;
    },

    /**
     * Clear local authentication state.
     */
    logout() {
        authStore.clearToken();
    }
};
