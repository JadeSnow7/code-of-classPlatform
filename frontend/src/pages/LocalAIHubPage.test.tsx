import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocalAIHubPage } from '@/pages/LocalAIHubPage';

const { initMock, streamChatMock } = vi.hoisted(() => ({
    initMock: vi.fn(),
    streamChatMock: vi.fn(),
}));

vi.mock('@jadesnow7/edge-ai-sdk', () => ({
    EduEdgeAI: {
        init: initMock,
        streamChat: streamChatMock,
    },
}));

vi.mock('@/hooks/useCloudAiHealth', () => ({
    useCloudAiHealth: () => ({
        status: 'ready',
        title: '云端 AI 可用',
        detail: '云端 AI 与模型上游链路正常。',
    }),
}));

vi.mock('@/hooks/useMobile', () => ({
    useMobile: () => false,
}));

vi.mock('@/lib/ai-stream', () => ({
    aiStreamClient: {
        streamChat: vi.fn(),
    },
}));

describe('LocalAIHubPage', () => {
    it('defaults to cloud mode in web runtime without initializing local ai', () => {
        Element.prototype.scrollIntoView = vi.fn();
        render(<LocalAIHubPage />);

        expect(screen.getByText('当前为 Web 环境，默认使用云端 AI 服务。')).toBeTruthy();
        expect(screen.getByText('云端模式')).toBeTruthy();
        expect(screen.queryByText(/本地推理引擎初始化失败/)).toBeNull();
        expect(initMock).not.toHaveBeenCalled();
    });
});
