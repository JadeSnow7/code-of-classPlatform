import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
    test('should display login page', async ({ page }) => {
        await page.goto('/login');

        await expect(page.getByRole('heading', { name: /登录/i })).toBeVisible();
        await expect(page.getByPlaceholder(/用户名/i)).toBeVisible();
        await expect(page.getByPlaceholder(/密码/i)).toBeVisible();
    });

    test('should show error on invalid credentials', async ({ page }) => {
        await page.goto('/login');

        await page.getByPlaceholder(/用户名/i).fill('invalid_user');
        await page.getByPlaceholder(/密码/i).fill('wrong_password');
        await page.getByRole('button', { name: /登录/i }).click();

        // Wait for error message
        await expect(page.getByText(/登录失败|用户名或密码错误/i)).toBeVisible({ timeout: 5000 });
    });

    test('should login successfully with valid credentials', async ({ page }) => {
        await page.goto('/login');

        // Use test credentials (adjust based on your test environment)
        await page.getByPlaceholder(/用户名/i).fill('student1');
        await page.getByPlaceholder(/密码/i).fill('password123');
        await page.getByRole('button', { name: /登录/i }).click();

        // Should redirect to courses page
        await expect(page).toHaveURL(/\/courses/, { timeout: 5000 });
        await expect(page.getByText(/我的课程|课程列表/i)).toBeVisible();
    });

    test('should persist login after page reload', async ({ page }) => {
        await page.goto('/login');

        await page.getByPlaceholder(/用户名/i).fill('student1');
        await page.getByPlaceholder(/密码/i).fill('password123');
        await page.getByRole('button', { name: /登录/i }).click();

        await expect(page).toHaveURL(/\/courses/, { timeout: 5000 });

        // Reload page
        await page.reload();

        // Should still be logged in
        await expect(page).toHaveURL(/\/courses/);
        await expect(page.getByText(/我的课程|课程列表/i)).toBeVisible();
    });
});
