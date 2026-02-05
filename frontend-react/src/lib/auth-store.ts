import { jwtDecode } from 'jwt-decode';
import { createTokenStore } from '@classplatform/shared';
import { logger } from '@/lib/logger';

const TOKEN_KEY = 'auth_token';

/**
 * Authenticated user information derived from the JWT.
 */
export interface User {
    /** User ID as a string. */
    id: string;
    /** Display name of the user. */
    name: string;
    /** Role used for permission checks. */
    role: 'admin' | 'teacher' | 'assistant' | 'student';
    /** Feature permissions granted to the user. */
    permissions: string[];
}

interface JWTPayload {
    uid: number;
    username: string;
    role: string;
    exp: number;
    iat: number;
}

const tokenStore = createTokenStore(
    {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
    },
    TOKEN_KEY
);

export const authStore = {
    /**
     * Persist a JWT in storage.
     *
     * @param token JWT string.
     */
    setToken(token: string) {
        tokenStore.setToken(token);
    },

    /**
     * Retrieve the stored JWT.
     *
     * @returns The token or null if missing.
     */
    getToken(): string | null {
        return tokenStore.getToken();
    },

    /**
     * Remove the stored JWT.
     */
    clearToken() {
        tokenStore.clearToken();
    },

    /**
     * Decode the JWT and return the user profile.
     *
     * @returns The user info or null if unauthenticated.
     */
    getUser(): User | null {
        const token = this.getToken();
        if (!token) return null;

        try {
            const decoded = jwtDecode<JWTPayload>(token);

            // Basic expiry check (exp is in seconds)
            if (decoded.exp * 1000 < Date.now()) {
                this.clearToken();
                return null;
            }

            return {
                id: String(decoded.uid),
                name: decoded.username,
                role: decoded.role as User['role'],
                permissions: ['ai:use', 'sim:use', 'course:read'], // Default perms, should come from backend ideally
            };
        } catch (e) {
            logger.error('failed to decode token', { error: e });
            this.clearToken();
            return null;
        }
    },

    /**
     * Check whether a valid user is available.
     *
     * @returns True when authenticated.
     */
    isAuthenticated(): boolean {
        return !!this.getUser();
    }
};
