import { describe, expect, it, vi } from 'vitest';

vi.mock('@sveltejs/kit', async () => {
	const actual = await vi.importActual<typeof import('@sveltejs/kit')>('@sveltejs/kit');
	return { ...actual, fail: (status: number, data: unknown) => ({ status, data }) };
});

import { ACTION_CONFLICT_MESSAGE, ACTION_FAILED_MESSAGE, failFromDbError } from './actionErrors';

describe('failFromDbError는 원문·code를 payload에 싣지 않는다', () => {
	it('일반 문구만, 원문은 서버 로그', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = failFromDbError(400, {
			message: 'duplicate key tbl_x',
			code: '42501'
		}) as unknown as {
			status: number;
			data: Record<string, unknown>;
		};
		expect(r.status).toBe(400);
		expect(r.data.message).toBe(ACTION_FAILED_MESSAGE);
		expect(r.data.code).toBeUndefined();
		expect(JSON.stringify(r.data.message)).not.toContain('duplicate');
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
	it('매핑 안 된 오류는 ruleIds [UNMAPPED]만, pgcode·constraint는 클라이언트에 없음', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = failFromDbError(400, {
			message: 'violates constraint "secret_tbl_weird_check"',
			code: '23514',
			details: 'Failing row contains (secret)'
		}) as unknown as { data: Record<string, unknown> };
		expect(r.data.ruleIds).toEqual(['UNMAPPED']);
		const json = JSON.stringify(r.data);
		expect(json).not.toContain('23514');
		expect(json).not.toContain('secret_tbl_weird_check');
		expect(json).not.toContain('UNMAPPED:');
		expect(r.data.code).toBeUndefined();
		const logged = JSON.stringify(log.mock.calls);
		expect(logged).toContain('23514');
		expect(logged).toContain('secret_tbl_weird_check');
		log.mockRestore();
	});
	it('매핑된 규칙 ID는 유지', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = failFromDbError(400, { message: 'bad [R-VAL-P04] x', code: '23514' }) as unknown as {
			data: { ruleIds: string[]; message: string };
		};
		expect(r.data.ruleIds).toEqual(['R-VAL-P04']);
		expect(r.data.message).toBe(ACTION_FAILED_MESSAGE);
	});
	it('충돌은 용어집 문구와 code CONFLICT 유지', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = failFromDbError(409, { message: 'x', code: '40001' }) as unknown as {
			data: { code?: string; message: string; ruleIds: string[] };
		};
		expect(r.data.code).toBe('CONFLICT');
		expect(r.data.message).toBe(ACTION_CONFLICT_MESSAGE);
		expect(r.data.ruleIds).toEqual(['UNMAPPED']);
	});
	it('extra의 code는 유지', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = failFromDbError(409, { message: 'x' }, { code: 'CONFLICT' }) as unknown as {
			data: { code?: string };
		};
		expect(r.data.code).toBe('CONFLICT');
	});
});
