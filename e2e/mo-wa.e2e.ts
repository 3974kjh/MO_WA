import { expect, test } from '@playwright/test';

/** Matches @supabase/ssr default: sb-<first label of project URL hostname>-auth-token */
const SUPABASE_COOKIE_NAME = 'sb-testproject-auth-token';

function forgedBase64SessionCookieValue() {
	const session = {
		access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.forged.signature',
		token_type: 'bearer',
		expires_in: 3600,
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		refresh_token: 'forged-refresh-token',
		user: {
			id: '00000000-0000-4000-8000-000000000099',
			aud: 'authenticated',
			role: 'authenticated',
			email: 'forged@example.com'
		}
	};
	return `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')}`;
}

test.describe('MO_WA auth and dashboard shell', () => {
	test('redirects unauthenticated users to login', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByRole('heading', { name: 'MO_WA' })).toBeVisible();
	});

	test('forged auth cookie cannot enter a protected page (BE-02)', async ({ page, context }) => {
		await context.addCookies([
			{
				name: SUPABASE_COOKIE_NAME,
				value: forgedBase64SessionCookieValue(),
				url: 'http://localhost:4173/'
			}
		]);

		const response = await page.goto('/');
		const status = response?.status() ?? 0;
		const onLogin = /\/login$/.test(page.url());

		// Must not render the authenticated landing (HF-1). testid is landing-only;
		// '로그아웃' must also be absent so a forged cookie cannot look signed-in.
		await expect(page.getByTestId('mo-wa-authenticated-landing')).toHaveCount(0);
		await expect(page.getByRole('button', { name: '로그아웃' })).toHaveCount(0);

		// getUser() 401 → login redirect; unreachable Auth → 503 (L-2). Neither grants access.
		expect(onLogin || status === 503).toBe(true);
		if (onLogin) {
			await expect(page.getByRole('heading', { name: 'MO_WA' })).toBeVisible();
		}
	});

	test('login page shows email and password fields', async ({ page }) => {
		await page.goto('/login');
		await expect(page.getByLabel('아이디(email)')).toBeVisible();
		await expect(page.getByLabel('패스워드')).toBeVisible();
		await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
	});
});
