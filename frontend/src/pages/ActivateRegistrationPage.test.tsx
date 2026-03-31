import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitePreview } from '@classplatform/shared';
import { ActivateRegistrationPage } from '@/pages/ActivateRegistrationPage';

const authApiMock = vi.hoisted(() => ({
    getInvite: vi.fn(),
    activateRegistration: vi.fn(),
}));

vi.mock('@/api/auth', () => ({
    authApi: authApiMock,
}));

const invite: InvitePreview = {
    username: 'M202500123',
    name: '胡傲东',
    role: 'student',
    status: 'pending_activation',
    expired: false,
    used: false,
    expires_at: Date.now() + 3600_000,
};

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/register/activate?token=test-token']}>
            <Routes>
                <Route path="/register/activate" element={<ActivateRegistrationPage />} />
                <Route path="/courses" element={<div>Courses Page</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('ActivateRegistrationPage', () => {
    beforeEach(() => {
        authApiMock.getInvite.mockResolvedValue(invite);
        authApiMock.activateRegistration.mockResolvedValue({
            id: '1',
            name: '胡傲东',
            role: 'student',
            permissions: [],
        });
    });

    it('submits the full activation questionnaire payload', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByDisplayValue('胡傲东')).toBeTruthy();
            expect(screen.getByDisplayValue('M202500123')).toBeTruthy();
        });

        fireEvent.change(screen.getByLabelText('设置密码'), { target: { value: 'newpass123' } });
        fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'newpass123' } });

        fireEvent.click(screen.getByLabelText(/同意平台将本表信息用于账号开通与个性化初始化/));
        fireEvent.click(screen.getByLabelText(/同意平台将去标识化结果用于首批用户群体分析与产品优化/));

        fireEvent.click(screen.getByText('集成电路设计'));
        fireEvent.click(screen.getByText('课程论文'));
        fireEvent.click(screen.getByText('Windows'));
        fireEvent.click(screen.getByText('仅 CPU / 核显'));
        fireEvent.click(screen.getByText('校园网 / 家宽稳定'));
        fireEvent.click(screen.getByText('正在写第一篇'));
        fireEvent.click(screen.getByText('引用规范与文献管理'));
        fireEvent.click(screen.getByText('ChatGPT / GPT 系列'));
        fireEvent.click(screen.getByText('晚上'));
        fireEvent.click(screen.getByText('给我方向再选择'));
        fireEvent.click(screen.getByText('平衡'));

        fireEvent.click(screen.getByRole('button', { name: '完成激活并进入平台' }));

        await waitFor(() => {
            expect(authApiMock.activateRegistration).toHaveBeenCalledWith({
                token: 'test-token',
                password: 'newpass123',
                confirm_password: 'newpass123',
                real_name: '胡傲东',
                student_id: 'M202500123',
                consent_personalization: true,
                analytics_opt_in: true,
                onboarding_profile: {
                    major_track: 'ic_design',
                    current_tasks: ['course_paper'],
                    primary_platform: 'windows',
                    local_compute_tier: 'cpu_only',
                    network_tier: 'stable_network',
                    writing_stage: 'first_paper',
                    pain_points: ['citation_management'],
                    prior_tools: ['chatgpt'],
                },
                learning_style: {
                    preferred_time: 'evening',
                    guidance_style: 'options_guidance',
                    feedback_verbosity: 'balanced',
                    latency_tolerance: 3,
                    guided_refusal_tolerance: 3,
                    evidence_first_tolerance: 3,
                },
            });
        });

        await waitFor(() => {
            expect(screen.getByText('Courses Page')).toBeTruthy();
        });
    });
});
