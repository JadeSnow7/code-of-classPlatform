import { jwtDecode } from 'jwt-decode';
import { logger } from '@/lib/logger';

const SESSION_KEY = 'auth_session';
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

type StoredSession = {
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    expiresIn?: number;
    refreshExpiresIn?: number;
};

function normalizeRole(role: string): User['role'] {
    if (role === 'admin' || role === 'teacher' || role === 'assistant' || role === 'student') {
        return role;
    }
    return 'student';
}

function readSession(): StoredSession | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<StoredSession>;
        if (!parsed.accessToken || !parsed.tokenType) {
            return null;
        }
        return {
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken,
            tokenType: parsed.tokenType,
            expiresIn: parsed.expiresIn,
            refreshExpiresIn: parsed.refreshExpiresIn,
        };
    } catch {
        return null;
    }
}

function writeSession(session: StoredSession | null) {
    if (!session) {
        localStorage.removeItem(SESSION_KEY);
        return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export const authStore = {
    setSession(session: StoredSession) {
        writeSession(session);
    },

    getSession(): StoredSession | null {
        return readSession();
    },

    setToken(token: string) {
        const existing = this.getSession();
        writeSession({
            accessToken: token,
            refreshToken: existing?.refreshToken,
            tokenType: existing?.tokenType ?? 'Bearer',
            expiresIn: existing?.expiresIn,
            refreshExpiresIn: existing?.refreshExpiresIn,
        });
    },

    getToken(): string | null {
        return this.getSession()?.accessToken ?? null;
    },

    getRefreshToken(): string | null {
        return this.getSession()?.refreshToken ?? null;
    },

    updateAccessToken(accessToken: string, expiresIn?: number) {
        const existing = this.getSession();
        if (!existing) {
            return;
        }
        writeSession({
            ...existing,
            accessToken,
            expiresIn,
        });
    },

    clearToken() {
        writeSession(null);
        localStorage.removeItem(PROFILE_KEY);
    },

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

    getUser(): User | null {
        const token = this.getToken();
        if (!token) return null;

        try {
            const decoded = jwtDecode<JWTPayload>(token);
            if (decoded.exp * 1000 < Date.now()) {
                return null;
            }

            const decodedId = String(decoded.uid);
            const profile = this.getProfile();
            const profileMatchesToken = profile?.id === decodedId;

            return {
                id: decodedId,
                name: profileMatchesToken ? profile.name : decoded.username,
                role: profileMatchesToken ? profile.role : normalizeRole(decoded.role),
                permissions: profileMatchesToken ? profile.permissions : [],
            };
        } catch (e) {
            logger.error('failed to decode token', { error: e });
            this.clearToken();
            return null;
        }
    },

    isAuthenticated(): boolean {
        return !!this.getUser();
    }
};
