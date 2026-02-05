export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  user_id?: number | string;
  username?: string;
  role?: string;
};

export type MeResponse = {
  id: number;
  username: string;
  name?: string;
  role: string;
  permissions: string[];
};

export type User = {
  id?: number | string;
  username?: string;
  name?: string;
  role?: string;
  permissions?: string[];
};

export type AuthSession = {
  token: string;
  tokenType: string;
  expiresIn?: number;
  user: User;
};
