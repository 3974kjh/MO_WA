import { defineConfig } from '@playwright/test';

// Non-secret test doubles so preview e2e does not use silent example fallbacks (M-2).
const e2eEnv = {
	PUBLIC_SUPABASE_URL: 'https://testproject.supabase.co',
	PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key'
};

export default defineConfig({
	webServer: {
		command: 'pnpm run build && pnpm run preview',
		port: 4173,
		env: { ...process.env, ...e2eEnv }
	},
	testMatch: '**/*.e2e.{ts,js}',
	testDir: 'e2e'
});
