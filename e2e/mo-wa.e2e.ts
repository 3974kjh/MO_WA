import { expect, test } from '@playwright/test';

test.describe('MO_WA auth and dashboard shell', () => {
	test('redirects unauthenticated users to login', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByRole('heading', { name: 'MO_WA' })).toBeVisible();
	});

	test('login page shows email and password fields', async ({ page }) => {
		await page.goto('/login');
		await expect(page.getByLabel('아이디(email)')).toBeVisible();
		await expect(page.getByLabel('패스워드')).toBeVisible();
		await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
	});
});
