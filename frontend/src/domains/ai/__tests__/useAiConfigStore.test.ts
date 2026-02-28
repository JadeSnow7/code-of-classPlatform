import { beforeEach, describe, expect, it } from 'vitest';
import { useAiConfigStore } from '../useAiConfigStore';

describe('useAiConfigStore persistence', () => {
    beforeEach(() => {
        localStorage.clear();
        useAiConfigStore.setState({
            defaultMode: 'auto',
            localModelStatus: 'not_downloaded',
            downloadProgress: 0,
            serverUrl: 'http://localhost:8080',
            provider: 'openai',
            customBaseUrl: '',
            apiKey: '',
            apiKeyMasked: '',
        });
    });

    it('does not persist raw apiKey to localStorage', () => {
        useAiConfigStore.getState().setApiKey('sk-test-very-secret');
        useAiConfigStore.getState().setApiKeyMasked('sk-***cret');

        const raw = localStorage.getItem('ai-config');
        expect(raw).not.toBeNull();

        const persisted = JSON.parse(raw as string) as { state: Record<string, unknown> };
        expect(persisted.state.apiKey).toBeUndefined();
        expect(persisted.state.apiKeyMasked).toBe('sk-***cret');
        expect(raw).not.toContain('sk-test-very-secret');
    });
});
