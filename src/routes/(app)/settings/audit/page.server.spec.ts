import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listAuditLog, countAuditRuleIds, listBotClients } = vi.hoisted(() => ({
	listAuditLog: vi.fn(),
	countAuditRuleIds: vi.fn(),
	listBotClients: vi.fn()
}));
vi.mock('$lib/server/repo', () => ({
	forUser: () => ({}),
	listAuditLog,
	countAuditRuleIds,
	listBotClients
}));

import { load } from './+page.server';

const BOT = '11111111-1111-4111-8111-111111111111';
const call = (qs = '') =>
	(load as unknown as (e: unknown) => Promise<Record<string, unknown>>)({
		locals: { user: { id: 'u1' }, supabase: {} },
		url: new URL(`http://x/settings/audit${qs}`)
	});

beforeEach(() => {
	vi.clearAllMocks();
	listAuditLog.mockResolvedValue({ data: [], truncated: false, error: null });
	countAuditRuleIds.mockResolvedValue({ data: { 'R-VAL-T05': 2 }, error: null });
	listBotClients.mockResolvedValue({
		data: [{ id: BOT, name: 'fm', key_prefix: 'abcdefghij', scopes: ['read'] }],
		error: null
	});
});

describe('settings/audit load', () => {
	it('URL 필터를 검증해 repo에 넘기고 규칙별 건수·봇 이름만 싣는다', async () => {
		const out = await call(`?bot=${BOT}&tool=a.b&result=denied&warn=1&rule=R-VAL-T05`);
		expect(listAuditLog).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				bot: BOT,
				tool: 'a.b',
				result: 'denied',
				warn: true,
				rule: 'R-VAL-T05'
			})
		);
		expect(out.ruleIdCounts).toEqual({ 'R-VAL-T05': 2 });
		expect(out.bots).toEqual([{ id: BOT, name: 'fm' }]);
		expect(JSON.stringify(out)).not.toMatch(/key_prefix|scopes|key_hash/);
	});

	it('잘못된 쿼리는 필터로 넘기지 않는다', async () => {
		await call('?bot=zzz&tool=a,b)&result=weird&rule=x');
		expect(listAuditLog).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ bot: '', tool: '', result: '', warn: false, rule: '' })
		);
	});

	it('잘림 여부를 전달하고, 오류 원문은 싣지 않는다', async () => {
		listAuditLog.mockResolvedValue({
			data: [],
			truncated: true,
			error: { code: '42501', message: 'permission denied secret_tbl' }
		});
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const out = await call();
		expect(out.truncated).toBe(true);
		expect(JSON.stringify(out)).not.toContain('secret_tbl');
		expect(out.error).toBeTruthy();
		log.mockRestore();
	});

	it('비로그인은 거부', async () => {
		await expect(
			(load as unknown as (e: unknown) => Promise<unknown>)({
				locals: { user: null, supabase: {} },
				url: new URL('http://x/settings/audit')
			})
		).rejects.toBeTruthy();
	});
});
