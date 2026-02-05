import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { loadAuthSession, saveAuthSession, loadMessages, saveMessages, clearMessages } from '../storage';
import { MAX_HISTORY } from '../config';
import type { ChatMessage } from '../types';

describe('storage', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
    });

    it('stores and loads auth session', async () => {
        const session = {
            token: 'token-123',
            tokenType: 'Bearer',
            expiresIn: 3600,
            user: { id: 1, username: 'alice', role: 'teacher', permissions: ['course:read'] },
        };

        await saveAuthSession(session);
        const loaded = await loadAuthSession();
        expect(loaded).toEqual(session);
    });

    it('trims chat messages to MAX_HISTORY', async () => {
        const messages: ChatMessage[] = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => ({
            role: 'user',
            content: `msg-${i}`,
            id: `id-${i}`,
            createdAt: i,
        }));

        await saveMessages(messages);
        const loaded = await loadMessages();

        expect(loaded.length).toBe(MAX_HISTORY);
        expect(loaded[0].content).toBe(`msg-${messages.length - MAX_HISTORY}`);
        expect(loaded[loaded.length - 1].content).toBe(`msg-${messages.length - 1}`);
    });

    it('clears chat messages', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: 'hello', id: '1', createdAt: 1 },
        ];
        await saveMessages(messages);
        await clearMessages();
        const loaded = await loadMessages();
        expect(loaded).toEqual([]);
    });
});
