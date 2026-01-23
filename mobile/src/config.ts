// API Configuration
export const API_BASE_URL = __DEV__ ? 'http://localhost:8080' : 'https://your-production-server.com';
export const API_PREFIX = '/api/v1';

// Network Configuration
export const NETWORK_TIMEOUT_MS = 60000;

// Chat Configuration
export const DEFAULT_CHAT_MODE = 'tutor';
export const MAX_CONTEXT_MESSAGES = 10;

// Storage Configuration
export const STORAGE_KEYS = {
    authSession: '@classPlatform:authSession',
    messages: '@classPlatform:messages',
} as const;

export const MAX_HISTORY = 50;
