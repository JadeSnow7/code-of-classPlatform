import { describe, it, expect } from 'vitest';
import { authReducer } from '../useAuth';

const baseState = {
    user: null,
    status: 'idle' as const,
    error: null,
};

describe('authReducer', () => {
    it('should handle RESTORE_START', () => {
        const next = authReducer(baseState, { type: 'RESTORE_START' });
        expect(next.status).toBe('loading');
        expect(next.error).toBeNull();
    });

    it('should handle LOGIN_SUCCESS', () => {
        const user = { id: '1', name: 'Alice', role: 'teacher' as const, permissions: ['course:read'] };
        const next = authReducer(baseState, { type: 'LOGIN_SUCCESS', user });
        expect(next.status).toBe('authenticated');
        expect(next.user).toEqual(user);
        expect(next.error).toBeNull();
    });

    it('should handle LOGIN_FAIL', () => {
        const next = authReducer(baseState, { type: 'LOGIN_FAIL', error: 'Invalid credentials' });
        expect(next.status).toBe('unauthenticated');
        expect(next.user).toBeNull();
        expect(next.error).toBe('Invalid credentials');
    });

    it('should handle LOGOUT', () => {
        const state = {
            user: { id: '1', name: 'Alice', role: 'teacher' as const, permissions: [] },
            status: 'authenticated' as const,
            error: null,
        };
        const next = authReducer(state, { type: 'LOGOUT' });
        expect(next.status).toBe('unauthenticated');
        expect(next.user).toBeNull();
        expect(next.error).toBeNull();
    });
});
