import type { ApiClient } from './http';
import type { LoginRequest, LoginResponse, MeResponse } from '../types';

export function createAuthApi(client: ApiClient) {
  return {
    login: (username: string, password: string) =>
      client.post<LoginResponse>('/auth/login', { username, password } satisfies LoginRequest),
    me: () => client.get<MeResponse>('/auth/me'),
    wecomLogin: (code: string) => client.post<LoginResponse>('/auth/wecom', { code }),
  };
}
