export type LoginRequest = {
    username: string;
    password: string;
};

export type LoginResponse = {
    access_token: string;
    token_type: string;
    expires_in?: number;
    user_id?: number;
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
