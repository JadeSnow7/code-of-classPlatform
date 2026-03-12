import type { ApiClient } from './http';
import type { ActivateRegistrationRequest, InvitePreview, LoginRequest, LoginResponse, MeResponse, RefreshRequest } from '../types';

export function createAuthApi(client: ApiClient) {
  return {
    login: (username: string, password: string) =>
      client.post<LoginResponse>('/auth/login', { username, password } satisfies LoginRequest),
    getInvite: (token: string) => client.get<InvitePreview>(`/auth/register/invite/${encodeURIComponent(token)}`),
    activateRegistration: (payload: ActivateRegistrationRequest) =>
      client.post<LoginResponse>('/auth/register/activate', payload),
    refresh: (refreshToken: string) =>
      client.post<LoginResponse>('/auth/refresh', { refresh_token: refreshToken } satisfies RefreshRequest),
    logout: (refreshToken: string) =>
      client.post<{ message: string }>('/auth/logout', { refresh_token: refreshToken } satisfies RefreshRequest),
    logoutAll: () => client.post<{ message: string }>('/auth/logout-all'),
    me: () => client.get<MeResponse>('/auth/me'),
    wecomLogin: (code: string) => client.post<LoginResponse>('/auth/wecom', { code }),
  };
}
