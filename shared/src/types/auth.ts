export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  user_id?: number | string;
  username?: string;
  name?: string;
  role?: string;
};

export type RefreshRequest = {
  refresh_token: string;
};

export type ActivateRegistrationRequest = {
  token: string;
  password: string;
  confirm_password: string;
};

export type InvitePreview = {
  username: string;
  name: string;
  role: string;
  status: string;
  expired: boolean;
  used: boolean;
  expires_at: number;
};

export type MeResponse = {
  id: number;
  username: string;
  name?: string;
  role: string;
  status?: string;
  last_login_at?: string;
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
  refreshToken?: string;
  tokenType: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  user: User;
};
