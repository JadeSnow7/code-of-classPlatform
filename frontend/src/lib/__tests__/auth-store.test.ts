import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authStore } from '../auth-store';

function base64UrlEncode(value: object) {
    const json = JSON.stringify(value);
    const encoded = btoa(json);
    return encoded.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createToken(payload: Record<string, unknown>) {
    const header = { alg: 'HS256', typ: 'JWT' };
    return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.signature`;
}

describe('authStore', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-04T00:00:00Z'));
    });

    it('returns user for valid token', () => {
        const token = createToken({
            uid: 123,
            username: 'alice',
            role: 'teacher',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000) - 10,
        });
        authStore.setToken(token);

        const user = authStore.getUser();
        expect(user).not.toBeNull();
        expect(user?.id).toBe('123');
        expect(user?.name).toBe('alice');
        expect(user?.role).toBe('teacher');
    });

    it('preserves session when access token is expired', () => {
        const token = createToken({
            uid: 123,
            username: 'alice',
            role: 'teacher',
            exp: Math.floor(Date.now() / 1000) - 10,
            iat: Math.floor(Date.now() / 1000) - 100,
        });
        authStore.setSession({
            accessToken: token,
            refreshToken: 'refresh-token',
            tokenType: 'Bearer',
            expiresIn: 900,
            refreshExpiresIn: 1209600,
        });

        const user = authStore.getUser();
        expect(user).toBeNull();
        expect(authStore.getSession()).toEqual({
            accessToken: token,
            refreshToken: 'refresh-token',
            tokenType: 'Bearer',
            expiresIn: 900,
            refreshExpiresIn: 1209600,
        });
        expect(authStore.getRefreshToken()).toBe('refresh-token');
    });

    it('isAuthenticated reflects token validity', () => {
        const token = createToken({
            uid: 123,
            username: 'alice',
            role: 'teacher',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000) - 10,
        });
        authStore.setToken(token);
        expect(authStore.isAuthenticated()).toBe(true);

        localStorage.clear();
        expect(authStore.isAuthenticated()).toBe(false);
    });
});
