import { jwtDecode } from 'jwt-decode';

const TOKEN_KEY = 'auth_token';

export interface User {
    id: string;
    name: string;
    role: 'admin' | 'teacher' | 'assistant' | 'student';
    permissions: string[];
}

interface JWTPayload {
    uid: number;
    username: string;
    role: string;
    exp: number;
    iat: number;
}

export const authStore = {
    setToken(token: string) {
        localStorage.setItem(TOKEN_KEY, token);
    },

    getToken(): string | null {
        return localStorage.getItem(TOKEN_KEY);
    },

    clearToken() {
        localStorage.removeItem(TOKEN_KEY);
    },

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
            console.error('Failed to decode token', e);
            this.clearToken();
            return null;
        }
    },

    isAuthenticated(): boolean {
        return !!this.getUser();
    }
};
