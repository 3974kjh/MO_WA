import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	requireUser,
	countAuditRuleIds,
	listBotClients,
	forUser,
	handleIssueBotKey,
	handleRevokeBotKey,
	handleSetBotKeyExpiry,
	handleSetBotKeyRateLimit
} = vi.hoisted(() => ({
	requireUser: vi.fn((u: { id: string } | null) => {
		if (!u) throw new Error('unauthorized');
		return u;
	}),
	countAuditRuleIds: vi.fn(),
	listBotClients: vi.fn(),
	forUser: vi.fn((_sb: unknown, ownerId: string) => ({
		actor: { kind: 'user', ownerId, botClientId: null }
	})),
	handleIssueBotKey: vi.fn(),
	handleRevokeBotKey: vi.fn(),
	handleSetBotKeyExpiry: vi.fn(),
	handleSetBotKeyRateLimit: vi.fn()
}));

vi.mock('$lib/server/web/requireUser', () => ({ requireUser }));
vi.mock('$lib/server/repo', () => ({
	forUser,
	countAuditRuleIds,
	listBotClients
}));
vi.mock('$lib/server/web/botKeyActions', () => ({
	handleIssueBotKey,
	handleRevokeBotKey,
	handleSetBotKeyExpiry,
	handleSetBotKeyRateLimit
}));
vi.mock('$lib/server/web/listError', () => ({
	INFO_LOAD_ERROR: '정보를 불러오지 못했어요.',
	publicListError: (_scope: string, err: unknown, fallback: string) => (err ? fallback : null)
}));

import { actions, load } from './+page.server';

beforeEach(() => {
	vi.clearAllMocks();
	countAuditRuleIds.mockResolvedValue({ data: { 'R-VAL-T05': 2 }, error: null });
	listBotClients.mockResolvedValue({
		data: [
			{
				id: '11111111-1111-4111-8111-111111111111',
				owner_id: 'u1',
				name: 'preview-fm',
				profile: 'finance-manager',
				description: null,
				key_prefix: 'abcdefgh12',
				scopes: ['read'],
				rate_limit_per_min: 60,
				expires_at: null,
				revoked_at: null,
				revoked_reason: null,
				last_used_at: null,
				created_at: '2026-11-21T00:00:00.000Z',
				updated_at: '2026-11-21T00:00:00.000Z'
			}
		],
		error: null
	});
});

describe('settings load (BE-12)', () => {
	it('returns ruleIdCounts and botClients without key_hash', async () => {
		const out = (await load({
			locals: { user: { id: 'u1' }, supabase: {} }
		} as never)) as {
			ruleIdCounts: Record<string, number>;
			botClients: Array<Record<string, unknown>>;
		};
		expect(out.ruleIdCounts).toEqual({ 'R-VAL-T05': 2 });
		expect(out.botClients).toHaveLength(1);
		expect(out.botClients[0]).not.toHaveProperty('key_hash');
		expect(JSON.stringify(out)).not.toMatch(/key_hash/);
		expect(JSON.stringify(out)).not.toMatch(/mowa_/);
	});
});

describe('settings load (FE-09)', () => {
	it('프로필별 기본 권한을 싣고, 평문 키·해시는 어디에도 없다', async () => {
		const out = (await load({
			locals: { user: { id: 'u1' }, supabase: {} }
		} as never)) as { profileScopes: Record<string, string[]> };
		expect(Object.keys(out.profileScopes)).toEqual(
			expect.arrayContaining(['finance-manager', 'importer', 'custom'])
		);
		expect(out.profileScopes['finance-manager']).toContain('positions:propose');
		expect(out.profileScopes['importer']).not.toContain('positions:propose');
		expect(out).not.toHaveProperty('apiKey');
		expect(JSON.stringify(out)).not.toMatch(/apiKey|mowa_[a-z0-9]{10}_/);
	});

	it('발급 액션은 no-store 헤더 설정 함수를 핸들러에 그대로 넘긴다', async () => {
		handleIssueBotKey.mockResolvedValue({ ok: true, apiKey: 'dummy', botClient: {} });
		const setHeaders = vi.fn();
		await actions.issue!({
			request: new Request('http://x/settings?/issue', { method: 'POST', body: new FormData() }),
			locals: { user: { id: 'u1' }, supabase: {} },
			setHeaders
		} as never);
		expect(handleIssueBotKey.mock.calls[0]![3]).toEqual({ setHeaders });
	});
});

describe('settings actions (BE-12)', () => {
	it('wires issue/revoke/setExpiry/setRateLimit', async () => {
		handleIssueBotKey.mockResolvedValue({ ok: true, apiKey: 'redacted-in-assert', botClient: {} });
		const body = new FormData();
		body.set('name', 'preview-fm');
		body.set('profile', 'finance-manager');
		const request = new Request('http://x/settings?/issue', { method: 'POST', body });
		const setHeaders = vi.fn();
		await actions.issue!({
			request,
			locals: { user: { id: 'u1' }, supabase: {} },
			setHeaders
		} as never);
		expect(handleIssueBotKey).toHaveBeenCalledWith(expect.anything(), 'u1', expect.any(FormData), {
			setHeaders
		});

		handleRevokeBotKey.mockResolvedValue({ ok: true });
		await actions.revoke!({
			request: new Request('http://x/settings?/revoke', { method: 'POST', body: new FormData() }),
			locals: { user: { id: 'u1' }, supabase: {} }
		} as never);
		expect(handleRevokeBotKey).toHaveBeenCalled();

		await actions.setExpiry!({
			request: new Request('http://x/settings?/setExpiry', {
				method: 'POST',
				body: new FormData()
			}),
			locals: { user: { id: 'u1' }, supabase: {} }
		} as never);
		expect(handleSetBotKeyExpiry).toHaveBeenCalled();

		await actions.setRateLimit!({
			request: new Request('http://x/settings?/setRateLimit', {
				method: 'POST',
				body: new FormData()
			}),
			locals: { user: { id: 'u1' }, supabase: {} }
		} as never);
		expect(handleSetBotKeyRateLimit).toHaveBeenCalled();
	});
});
