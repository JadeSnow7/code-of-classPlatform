import { expect, test, type Page } from '@playwright/test';

function base64UrlEncode(value: object) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createTestToken() {
    return `${base64UrlEncode({ alg: 'HS256', typ: 'JWT' })}.${base64UrlEncode({
        uid: 1,
        username: 'student1',
        role: 'student',
        exp: 1924992000,
        iat: 1704067200,
    })}.signature`;
}

async function mockAuthenticatedSession(page: Page) {
    const token = createTestToken();

    await page.addInitScript((value: string) => {
        localStorage.setItem('auth_token', value);
    }, token);

    await page.route('**/api/v1/**', async (route) => {
        const url = new URL(route.request().url());
        const { pathname } = url;

        if (pathname.endsWith('/auth/me')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 1,
                    username: 'student1',
                    name: '测试学生',
                    role: 'student',
                    permissions: ['course:read', 'ai:use', 'sim:use'],
                }),
            });
            return;
        }

        if (pathname.match(/\/courses\/?$/)) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
            return;
        }

        if (pathname.match(/\/courses\/\d+$/)) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 1,
                    name: '电磁场数值分析',
                    teacher_id: 9001,
                    teacher_name: '张老师',
                }),
            });
            return;
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({}),
        });
    });
}

test.describe('Shell smoke', () => {
    test('courses empty state stays centered and quiet in dark mode', async ({ page }) => {
        await mockAuthenticatedSession(page);
        await page.emulateMedia({ colorScheme: 'dark' });

        await page.goto('/courses');

        await expect(page.getByRole('heading', { name: '我的课程' })).toBeVisible();
        await expect(page.getByText('暂无课程')).toBeVisible();
        await expect(page.getByText('当前账号下还没有可进入的课程空间。课程创建或加入后，这里会自动出现。')).toBeVisible();
    });

    test('local ai composer remains visible at the bottom of the page', async ({ page }) => {
        await mockAuthenticatedSession(page);

        await page.goto('/local-ai');

        await expect(page.getByPlaceholder(/向 AI 提问/)).toBeVisible();
        await expect(page.getByText('Local AI 会话')).toBeVisible();
    });

    test('workspace renders parameter rail, code panel, and ai rail', async ({ page }) => {
        await mockAuthenticatedSession(page);
        await page.emulateMedia({ colorScheme: 'dark' });

        await page.goto('/courses/1/simulation');

        await expect(page.getByText('仿真参数')).toBeVisible();
        await expect(page.getByText('实验仿真工作台')).toBeVisible();
        await expect(page.getByText('工作台助手')).toBeVisible();
        await expect(page.getByRole('button', { name: '打开 AI 问答' })).toBeVisible();
    });
});
