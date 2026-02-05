import { apiClient } from './api/client';
import { setToken, clearToken } from './api/getAuthHeaders';

const MOCK_MODE = import.meta.env.VITE_MOCK_API === 'true';

/**
 * Authenticated user information returned by the auth service.
 */
export interface User {
    /** User identifier. */
    id: string;
    /** Display name. */
    name: string;
    /** Role used for access control. */
    role: 'admin' | 'teacher' | 'assistant' | 'student';
    /** Permission identifiers. */
    permissions: string[];
}

/**
 * Login response containing the JWT and user profile.
 */
export interface LoginResponse {
    /** JWT access token. */
    token: string;
    /** Authenticated user profile. */
    user: User;
}

const MOCK_USER: User = {
    id: '1',
    name: 'Mock User',
    role: 'student',
    permissions: ['ai:use', 'sim:use', 'course:read'],
};

export const authService = {
    /**
     * Authenticate with username and password.
     *
     * @param username Username or account identifier.
     * @param password Plain text password.
     * @returns The login response with token and user profile.
     */
    async login(username: string, password: string): Promise<LoginResponse> {
        if (MOCK_MODE) {
            const token = 'mock-jwt-token';
            setToken(token);
            return { token, user: MOCK_USER };
        }

        // Backend returns: { access_token, token_type, expires_in }
        const response = await apiClient.post<{ access_token: string; token_type: string; expires_in: number }>('/auth/login', {
            username,
            password,
        });

        const token = response.access_token;
        setToken(token);

        // Decode JWT to get user info (payload is base64 encoded)
        const payload = JSON.parse(atob(token.split('.')[1]));
        const user: User = {
            id: String(payload.uid),
            name: payload.username,
            role: payload.role as User['role'],
            permissions: ['ai:use', 'sim:use', 'course:read'], // Default permissions
        };

        return { token, user };
    },

    /**
     * Fetch the current authenticated user.
     *
     * @returns The user profile.
     */
    async me(): Promise<User> {
        if (MOCK_MODE) {
            return MOCK_USER;
        }

        const response = await apiClient.get<User>('/auth/me');
        return response;
    },

    /**
     * Clear the stored auth token.
     */
    logout(): void {
        clearToken();
    },
};
