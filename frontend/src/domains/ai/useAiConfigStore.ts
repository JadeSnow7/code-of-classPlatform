import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AiSourceMode = 'local' | 'cloud' | 'auto';
export type LocalModelStatus = 'not_downloaded' | 'downloading' | 'ready' | 'error';

interface AiConfigState {
    defaultMode: AiSourceMode;
    localModelStatus: LocalModelStatus;
    downloadProgress: number;
    serverUrl: string;
    provider: 'openai' | 'anthropic' | 'custom';
    customBaseUrl: string;
    apiKey: string;
    apiKeyMasked: string;
    setDefaultMode: (mode: AiSourceMode) => void;
    setLocalModelStatus: (status: LocalModelStatus) => void;
    setDownloadProgress: (progress: number) => void;
    setServerUrl: (url: string) => void;
    setProvider: (provider: 'openai' | 'anthropic' | 'custom') => void;
    setCustomBaseUrl: (url: string) => void;
    setApiKey: (key: string) => void;
    setApiKeyMasked: (masked: string) => void;
}

export const useAiConfigStore = create<AiConfigState>()(
    persist(
        (set) => ({
            defaultMode: 'auto',
            localModelStatus: 'not_downloaded',
            downloadProgress: 0,
            serverUrl: 'http://localhost:8080',
            provider: 'openai',
            customBaseUrl: '',
            apiKey: '',
            apiKeyMasked: '',
            setDefaultMode: (defaultMode) => set({ defaultMode }),
            setLocalModelStatus: (localModelStatus) => set({ localModelStatus }),
            setDownloadProgress: (downloadProgress) => set({ downloadProgress }),
            setServerUrl: (serverUrl) => set({ serverUrl }),
            setProvider: (provider) => set({ provider }),
            setCustomBaseUrl: (customBaseUrl) => set({ customBaseUrl }),
            setApiKey: (apiKey) => set({ apiKey }),
            setApiKeyMasked: (apiKeyMasked) => set({ apiKeyMasked }),
        }),
        {
            name: 'ai-config',
            partialize: (state) => ({
                defaultMode: state.defaultMode,
                localModelStatus: state.localModelStatus,
                downloadProgress: state.downloadProgress,
                serverUrl: state.serverUrl,
                provider: state.provider,
                customBaseUrl: state.customBaseUrl,
                apiKeyMasked: state.apiKeyMasked,
            }),
        }
    )
);
