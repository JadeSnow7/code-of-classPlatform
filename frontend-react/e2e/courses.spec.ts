import { test, expect } from '@playwright/test';

test.describe('Course Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Login before each test
        await page.goto('/login');
        await page.getByPlaceholder(/用户名/i).fill('student1');
        await page.getByPlaceholder(/密码/i).fill('password123');
        await page.getByRole('button', { name: /登录/i }).click();
        await expect(page).toHaveURL(/\/courses/, { timeout: 5000 });
    });

    test('should display course list', async ({ page }) => {
        await expect(page.getByText(/我的课程|课程列表/i)).toBeVisible();

        // Should have at least one course card or empty state
        const hasCourses = await page.locator('[class*="grid"]').count() > 0;
        const hasEmptyState = await page.getByText(/暂无课程/i).isVisible();

        expect(hasCourses || hasEmptyState).toBeTruthy();
    });

    test('should navigate to course detail', async ({ page }) => {
        // Wait for courses to load
        await page.waitForLoadState('networkidle');

        // Find first course card
        const firstCourse = page.locator('a[href*="/courses/"]').first();
        const isVisible = await firstCourse.isVisible();

        if (isVisible) {
            await firstCourse.click();

            // Should navigate to course detail page
            await expect(page).toHaveURL(/\/courses\/\d+/, { timeout: 5000 });
        } else {
            test.skip();
        }
    });

    test('should display course navigation tabs', async ({ page }) => {
        await page.waitForLoadState('networkidle');

        const firstCourse = page.locator('a[href*="/courses/"]').first();
        const isVisible = await firstCourse.isVisible();

        if (isVisible) {
            await firstCourse.click();
            await expect(page).toHaveURL(/\/courses\/\d+/);

            // Check for navigation tabs
            await expect(page.getByRole('link', { name: /概览|章节|作业|测验/i }).first()).toBeVisible();
        } else {
            test.skip();
        }
    });
});
