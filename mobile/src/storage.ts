import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJsonStore } from '@classplatform/shared';
import { STORAGE_KEYS, MAX_HISTORY } from './config';
import type { AuthSession, ChatMessage } from './types';

const asyncStorageAdapter = {
    getItem: (key: string) => AsyncStorage.getItem(key),
    setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
    removeItem: (key: string) => AsyncStorage.removeItem(key),
};

const authSessionStore = createJsonStore<AuthSession>(asyncStorageAdapter, STORAGE_KEYS.authSession);
const messageStore = createJsonStore<ChatMessage[]>(asyncStorageAdapter, STORAGE_KEYS.messages, {
    defaultValue: [],
});

// Auth Session Storage
export async function loadAuthSession(): Promise<AuthSession | null> {
    return authSessionStore.load();
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
    await authSessionStore.save(session);
}

export async function clearAuthSession(): Promise<void> {
    await authSessionStore.clear();
}

// Chat Messages Storage
export async function loadMessages(): Promise<ChatMessage[]> {
    return messageStore.load();
}

export async function saveMessages(messages: ChatMessage[]): Promise<void> {
    const trimmed = messages.slice(-MAX_HISTORY);
    await messageStore.save(trimmed);
}

export async function clearMessages(): Promise<void> {
    await messageStore.clear();
}
