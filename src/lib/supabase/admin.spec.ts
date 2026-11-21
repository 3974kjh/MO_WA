import { afterEach, describe, expect, it, vi } from 'vitest';

describe('createSupabaseAdminClient (M-6)', () => {
	afterEach(() => {
		vi.resetModules();
		vi.doUnmock('./config');
	});

	it('throws when service role key is missing', async () => {
		vi.doMock('./config', () => ({
			getSupabasePublicConfig: () => ({
				url: 'https://proj.supabase.co',
				anonKey: 'anon',
				configured: true
			}),
			getSupabaseServiceRoleKey: () => undefined
		}));
		const { createSupabaseAdminClient } = await import('./admin');
		expect(() => createSupabaseAdminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
	});

	it('throws when URL is the example.supabase.co placeholder', async () => {
		vi.doMock('./config', () => ({
			getSupabasePublicConfig: () => ({
				url: 'https://example.supabase.co',
				anonKey: 'anon',
				configured: true
			}),
			getSupabaseServiceRoleKey: () => 'service-role-key'
		}));
		const { createSupabaseAdminClient } = await import('./admin');
		expect(() => createSupabaseAdminClient()).toThrow(/placeholder|example\.supabase\.co/i);
	});

	it('throws when public config is not configured', async () => {
		vi.doMock('./config', () => ({
			getSupabasePublicConfig: () => ({
				url: 'https://proj.supabase.co',
				anonKey: 'anon',
				configured: false
			}),
			getSupabaseServiceRoleKey: () => 'service-role-key'
		}));
		const { createSupabaseAdminClient } = await import('./admin');
		expect(() => createSupabaseAdminClient()).toThrow(/not configured/i);
	});
});
