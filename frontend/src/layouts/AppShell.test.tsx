import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/ThemeProvider';
import { useAiConfigStore } from '@/domains/ai/useAiConfigStore';
import { AppShell } from '@/layouts/AppShell';

vi.mock('@/hooks/useCloudAiHealth', () => ({
    useCloudAiHealth: () => ({
        status: 'ready',
        title: '云端 AI 可用',
        detail: '云端 AI 与模型上游链路正常。',
    }),
}));

vi.mock('@/hooks/useEventStream', () => ({
    useEventStream: () => ({ unreadAnnouncements: 0, lastEvent: null, connected: false }),
}));

function renderShell(initialEntry: string) {
    return render(
        <ThemeProvider>
            <MemoryRouter initialEntries={[initialEntry]}>
                <Routes>
                    <Route path="/" element={<AppShell />}>
                        <Route path="local-ai" element={<div>Local AI Page</div>} />
                        <Route path="learning" element={<div>Learning Page</div>} />
                    </Route>
                </Routes>
            </MemoryRouter>
        </ThemeProvider>,
    );
}

describe('AppShell', () => {
    beforeEach(() => {
        localStorage.clear();
        useAiConfigStore.setState({
            defaultMode: 'auto',
            localModelStatus: 'ready',
            downloadProgress: 0,
            serverUrl: 'http://localhost:8080',
            provider: 'openai',
            customBaseUrl: '',
            apiKey: '',
            apiKeyMasked: '',
        });
        Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true });
        (window as typeof window & { __setMatchMediaDarkMode: (matches: boolean) => void }).__setMatchMediaDarkMode(
            false,
        );
    });

    it('renders the light shell with paired sidebar and content backgrounds', () => {
        renderShell('/local-ai');

        expect(screen.getByText('云端 AI 可用')).toBeTruthy();
        expect(screen.getByText('本地 NPU 就绪')).toBeTruthy();

        const sidebar = screen.getByTestId('app-shell-sidebar');
        const main = screen.getByTestId('app-shell-main');

        expect(sidebar.className).toContain('bg-slate-50');
        expect(sidebar.className).toContain('dark:bg-slate-950');
        expect(main.className).toContain('bg-white');
    });

    it('switches the main shell surface when dark mode is active', () => {
        localStorage.setItem('theme-mode', 'dark');

        renderShell('/learning');

        const main = screen.getByTestId('app-shell-main');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(main.className).toContain('bg-slate-900');
    });
});
