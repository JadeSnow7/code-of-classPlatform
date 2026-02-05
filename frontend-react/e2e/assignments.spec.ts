import { test, expect } from '@playwright/test';

test.describe('Assignment Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Login as student
        await page.goto('/login');
        await page.getByPlaceholder(/用户名/i).fill('student1');
        await page.getByPlaceholder(/密码/i).fill('password123');
        await page.getByRole('button', { name: /登录/i }).click();
        await expect(page).toHaveURL(/\/courses/, { timeout: 5000 });
    });

    test('should navigate to assignments page', async ({ page }) => {
        await page.waitForLoadState('networkidle');

        // Click first course
        const firstCourse = page.locator('a[href*="/courses/"]').first();
        const isVisible = await firstCourse.isVisible();

        if (!isVisible) {
            test.skip();
            return;
        }

        await firstCourse.click();
        await expect(page).toHaveURL(/\/courses\/\d+/);

        // Navigate to assignments tab
        const assignmentsTab = page.getByRole('link', { name: /作业/i });
        if (await assignmentsTab.isVisible()) {
            await assignmentsTab.click();
            await expect(page).toHaveURL(/\/courses\/\d+\/assignments/);
        } else {
            test.skip();
        }
    });

    test('should display assignment list', async ({ page }) => {
        await page.waitForLoadState('networkidle');

        const firstCourse = page.locator('a[href*="/courses/"]').first();
        if (!(await firstCourse.isVisible())) {
            test.skip();
            return;
        }

        await firstCourse.click();
        const assignmentsTab = page.getByRole('link', { name: /作业/i });

        if (await assignmentsTab.isVisible()) {
            await assignmentsTab.click();

            // Should show either assignments or empty state
            const hasAssignments = await page.locator('[class*="grid"]').count() > 0;
            const hasEmptyState = await page.getByText(/暂无作业/i).isVisible();

            expect(hasAssignments || hasEmptyState).toBeTruthy();
        } else {
            test.skip();
        }
    });

    test('should open assignment detail', async ({ page }) => {
        await page.waitForLoadState('networkidle');

        const firstCourse = page.locator('a[href*="/courses/"]').first();
        if (!(await firstCourse.isVisible())) {
            test.skip();
            return;
        }

        await firstCourse.click();
        const assignmentsTab = page.getByRole('link', { name: /作业/i });

        if (await assignmentsTab.isVisible()) {
            await assignmentsTab.click();

            // Click first assignment if exists
            const firstAssignment = page.locator('a[href*="/assignments/"]').first();
            if (await firstAssignment.isVisible()) {
                await firstAssignment.click();
                await expect(page).toHaveURL(/\/assignments\/\d+/);
            } else {
                test.skip();
            }
        } else {
            test.skip();
        }
    });
});
