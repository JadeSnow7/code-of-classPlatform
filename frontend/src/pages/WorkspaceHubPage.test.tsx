import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/ThemeProvider';
import { useAiConfigStore } from '@/domains/ai/useAiConfigStore';
import WorkspaceHubPage from '@/pages/WorkspaceHubPage';

function renderWorkspace() {
    return render(
        <ThemeProvider>
            <WorkspaceHubPage />
        </ThemeProvider>,
    );
}

describe('WorkspaceHubPage', () => {
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
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('renders the academic review workspace and removes legacy simulation language', () => {
        renderWorkspace();

        expect(screen.getByText('写作辅导与审查配置')).toBeTruthy();
        expect(screen.getByText('摘要.md')).toBeTruthy();
        expect(screen.getByText('参考文献.md')).toBeTruthy();
        expect(screen.getByText('GraphRAG 知识网络')).toBeTruthy();
        expect(screen.queryByText('Python 代码')).toBeNull();
        expect(screen.queryByText(/Laplace/)).toBeNull();
        expect(screen.queryByText('热力图')).toBeNull();
    });

    it('plays the review chain and appends a cited assistant response', () => {
        renderWorkspace();

        fireEvent.click(screen.getByRole('button', { name: /运行全文智能审查/ }));

        act(() => {
            vi.advanceTimersByTime(2400);
        });

        expect(screen.getByText('Planner 正在拆解写作审查任务...')).toBeTruthy();
        expect(screen.getByText('GraphRAG 正在课程图谱中检索标准规范...')).toBeTruthy();
        expect(screen.getByText('Verifier 正在核验逻辑冲突...')).toBeTruthy();
        expect(screen.getByText(/\[1\] 研究生学位论文撰写规范/)).toBeTruthy();
        expect(screen.getByText(/\[2\] GB\/T 7714-2015/)).toBeTruthy();
        expect(screen.getByText(/关键实验数据的来源标注/)).toBeTruthy();
    });

    it('persists the cloud compute selection through ai config store', () => {
        renderWorkspace();

        fireEvent.click(screen.getByRole('button', { name: 'Cloud GPU' }));

        expect(useAiConfigStore.getState().defaultMode).toBe('cloud');
    });
});
