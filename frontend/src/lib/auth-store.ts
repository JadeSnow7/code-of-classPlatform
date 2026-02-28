import { jwtDecode } from 'jwt-decode';
import { createTokenStore } from '@classplatform/shared';
import { logger } from '@/lib/logger';

const TOKEN_KEY = 'auth_token';
const PROFILE_KEY = 'auth_profile';

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

type StoredProfile = {
    id: string;
    name: string;
    role: User['role'];
    permissions: string[];
};

const tokenStore = createTokenStore(
    {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
    },
    TOKEN_KEY
);

function normalizeRole(role: string): User['role'] {
    if (role === 'admin' || role === 'teacher' || role === 'assistant' || role === 'student') {
        return role;
    }
    return 'student';
}

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
        localStorage.removeItem(PROFILE_KEY);
    },

    /**
     * Persist user profile fields from backend /auth/me.
     *
     * @param profile Authenticated profile with server-authoritative permissions.
     */
    setProfile(profile: User) {
        const stored: StoredProfile = {
            id: profile.id,
            name: profile.name,
            role: profile.role,
            permissions: profile.permissions,
        };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(stored));
    },

    getProfile(): StoredProfile | null {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw) as Partial<StoredProfile>;
            if (!parsed.id || !parsed.name || !parsed.role || !Array.isArray(parsed.permissions)) {
                return null;
            }
            return {
                id: parsed.id,
                name: parsed.name,
                role: normalizeRole(parsed.role),
                permissions: parsed.permissions.filter((v): v is string => typeof v === 'string'),
            };
        } catch {
            return null;
        }
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

            const decodedId = String(decoded.uid);
            const profile = this.getProfile();
            const profileMatchesToken = profile?.id === decodedId;

            return {
                id: decodedId,
                name: profileMatchesToken ? profile.name : decoded.username,
                role: profileMatchesToken ? profile.role : normalizeRole(decoded.role),
                // Use server-authoritative permissions when profile is available.
                permissions: profileMatchesToken ? profile.permissions : [],
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
