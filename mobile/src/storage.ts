import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, MAX_HISTORY } from './config';
import type { AuthSession, ChatMessage } from './types';

// Auth Session Storage
export async function loadAuthSession(): Promise<AuthSession | null> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.authSession);
        if (!raw) return null;
        return JSON.parse(raw) as AuthSession;
    } catch {
        return null;
    }
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify(session));
}

export async function clearAuthSession(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.authSession);
}

// Chat Messages Storage
export async function loadMessages(): Promise<ChatMessage[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.messages);
        if (!raw) return [];
        return JSON.parse(raw) as ChatMessage[];
    } catch {
        return [];
    }
}

export async function saveMessages(messages: ChatMessage[]): Promise<void> {
    const trimmed = messages.slice(-MAX_HISTORY);
    await AsyncStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(trimmed));
}

export async function clearMessages(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.messages);
}
