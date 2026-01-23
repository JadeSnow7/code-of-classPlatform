import { apiClient } from './api/client';
import { setToken, clearToken } from './api/getAuthHeaders';

const MOCK_MODE = import.meta.env.VITE_MOCK_API === 'true';

export interface User {
    id: string;
    name: string;
    role: 'admin' | 'teacher' | 'assistant' | 'student';
    permissions: string[];
}

export interface LoginResponse {
    token: string;
    user: User;
}

const MOCK_USER: User = {
    id: '1',
    name: 'Mock User',
    role: 'student',
    permissions: ['ai:use', 'sim:use', 'course:read'],
};

export const authService = {
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

        const token = response.data.access_token;
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

    async me(): Promise<User> {
        if (MOCK_MODE) {
            return MOCK_USER;
        }

        const response = await apiClient.get<User>('/auth/me');
        return response.data;
    },

    logout(): void {
        clearToken();
    },
};
