import { useReducer, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { authApi } from '@/api/auth';
import { authStore, type User } from '@/lib/auth-store';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
    user: User | null;
    status: AuthStatus;
    error: string | null;
}

type AuthAction =
    | { type: 'RESTORE_START' }
    | { type: 'RESTORE_SUCCESS'; user: User }
    | { type: 'RESTORE_FAIL' }
    | { type: 'LOGIN_START' }
    | { type: 'LOGIN_SUCCESS'; user: User }
    | { type: 'LOGIN_FAIL'; error: string }
    | { type: 'LOGOUT' };

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

const initialState: AuthState = {
    user: null,
    status: 'idle',
    error: null,
};

export function authReducer(state: AuthState, action: AuthAction): AuthState {
    switch (action.type) {
        case 'RESTORE_START':
        case 'LOGIN_START':
            return { ...state, status: 'loading', error: null };

        case 'RESTORE_SUCCESS':
        case 'LOGIN_SUCCESS':
            return { user: action.user, status: 'authenticated', error: null };

        case 'RESTORE_FAIL':
            return { user: null, status: 'unauthenticated', error: null };

        case 'LOGIN_FAIL':
            return { user: null, status: 'unauthenticated', error: action.error };

        case 'LOGOUT':
            return { user: null, status: 'unauthenticated', error: null };

        default:
            return state;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook & Context
// ─────────────────────────────────────────────────────────────────────────────

interface AuthContextValue {
    user: User | null;
    status: AuthStatus;
    error: string | null;
    login: (username: string, password: string) => Promise<void>;
    wecomLogin: (code: string) => Promise<void>;
    logout: () => void;
    hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(authReducer, initialState);

    // Bootstrap: restore session on mount
    useEffect(() => {
        // Check if we have a token in store
        const token = authStore.getToken();

        if (token && state.status === 'idle') {
            dispatch({ type: 'RESTORE_START' });
            // Verify with backend
            authApi.me()
                .then((user) => dispatch({ type: 'RESTORE_SUCCESS', user }))
                .catch(() => {
                    // Token invalid or expired
                    authStore.clearToken();
                    dispatch({ type: 'RESTORE_FAIL' });
                });
        } else if (!token && state.status === 'idle') {
            dispatch({ type: 'RESTORE_FAIL' });
        }
    }, [state.status]);

    const login = useCallback(async (username: string, password: string) => {
        dispatch({ type: 'LOGIN_START' });
        try {
            const user = await authApi.login(username, password);
            dispatch({ type: 'LOGIN_SUCCESS', user });
        } catch (error) {
            dispatch({
                type: 'LOGIN_FAIL',
                error: error instanceof Error ? error.message : 'Login failed',
            });
            throw error;
        }
    }, []);

    const wecomLogin = useCallback(async (code: string) => {
        dispatch({ type: 'LOGIN_START' });
        try {
            const user = await authApi.wecomLogin(code);
            dispatch({ type: 'LOGIN_SUCCESS', user });
        } catch (error) {
            dispatch({
                type: 'LOGIN_FAIL',
                error: error instanceof Error ? error.message : 'WeChat Work login failed',
            });
            throw error;
        }
    }, []);

    const logout = useCallback(() => {
        authApi.logout();
        dispatch({ type: 'LOGOUT' });
    }, []);

    const hasPermission = useCallback(
        (permission: string) => {
            return state.user?.permissions.includes(permission) ?? false;
        },
        [state.user]
    );

    return (
        <AuthContext.Provider
            value={{
                user: state.user,
                status: state.status,
                error: state.error,
                login,
                wecomLogin,
                logout,
                hasPermission,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
