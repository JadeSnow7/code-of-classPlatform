/**
 * Auth API helpers wrapping the shared client with local storage.
 */
import { api } from '@/lib/api-client';
import { authStore, type User } from '@/lib/auth-store';

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
        const user = authStore.getUser();
        if (!user) throw new Error('Invalid token received');
        return user;
    },

    /**
     * Fetch the current user from the API and local storage.
     *
     * @returns The authenticated user.
     */
    async me(): Promise<User> {
        await api.auth.me();
        const user = authStore.getUser();
        if (!user) throw new Error('No user in storage');
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
        const user = authStore.getUser();
        if (!user) throw new Error('Invalid token received from WeChat Work');
        return user;
    },

    /**
     * Clear local authentication state.
     */
    logout() {
        authStore.clearToken();
    }
};
