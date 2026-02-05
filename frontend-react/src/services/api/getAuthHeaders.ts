const TOKEN_KEY = 'auth_token';

/**
 * Read the stored auth token.
 *
 * @returns The token string or null.
 */
export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Persist a new auth token.
 *
 * @param token JWT token string.
 */
export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Remove the stored auth token.
 */
export function clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

/**
 * Build Authorization headers for authenticated requests.
 *
 * @returns Headers with the Bearer token when present.
 */
export function getAuthHeaders(): HeadersInit {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}
