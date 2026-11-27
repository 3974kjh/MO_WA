import { describe, expect, it, vi } from 'vitest';

vi.mock('@sveltejs/kit', async () => {
	const actual = await vi.importActual<typeof import('@sveltejs/kit')>('@sveltejs/kit');
	return { ...actual, fail: (status: number, data: unknown) => ({ status, data }) };
});

import {
	ACTION_CONFLICT_MESSAGE,
	ACTION_FAILED_MESSAGE,
	ACTION_SUPERSEDED_MESSAGE,
	failFromDbError,
	isConflictDbError,
	isSupersededDbError
} from './actionErrors';

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

describe('CONFLICT 판별은 code·매핑 기준 (Low-1/Nit-1)', () => {
	type D = { code?: string; message: string; ruleIds: string[] };
	const run = (err: { code?: string; message?: string; constraint?: string }) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		return (failFromDbError(409, err) as unknown as { data: D }).data;
	};
	const conflicts: Array<[string, { code?: string; message?: string; constraint?: string }]> = [
		['40001 serialization', { code: '40001', message: 'x' }],
		[
			'R-PERM-11 client_ref + 23505',
			{ code: '23505', constraint: 'journal_entries_owner_id_client_ref_key' }
		],
		['R-PERM-13 버전 충돌', { message: '[R-PERM-13] CONFLICT: position changed' }],
		['앱 code CONFLICT', { code: 'CONFLICT', message: 'x' }]
	];
	it.each(conflicts)('CONFLICT: %s', (_n, err) => {
		expect(isConflictDbError(err)).toBe(true);
		const d = run(err);
		expect(d.code).toBe('CONFLICT');
		expect(d.message).toBe(ACTION_CONFLICT_MESSAGE);
	});
	const nonConflicts: Array<[string, { code?: string; message?: string; constraint?: string }]> = [
		['R-VAL-P03 23505', { code: '23505', constraint: 'positions_one_active_per_status' }],
		['R-VAL-I01 23505', { code: '23505', constraint: 'instruments_owner_id_ticker_key' }],
		[
			'R-VAL-R03 23505',
			{ code: '23505', constraint: 'reports_owner_id_kind_report_date_slug_key' }
		],
		['매핑 없는 23505', { code: '23505', constraint: 'some_unknown_key' }],
		['메시지에 conflict만, 21000', { code: '21000', message: 'conflict in data' }],
		['code 없이 메시지 conflict', { message: 'CONFLICT detected' }]
	];
	it.each(nonConflicts)('비CONFLICT: %s', (_n, err) => {
		expect(isConflictDbError(err)).toBe(false);
		const d = run(err);
		expect(d.code).toBeUndefined();
		expect(d.message).toBe(ACTION_FAILED_MESSAGE);
	});
	it('매핑된 R-VAL 23505는 ruleIds 유지', () => {
		expect(run({ code: '23505', constraint: 'positions_one_active_per_status' }).ruleIds).toEqual([
			'R-VAL-P03'
		]);
	});
});

describe('superseded(다른 세션에서 새 요청으로 바뀜)는 중립 안내', () => {
	const call = (err: { code?: string; message?: string }) => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = failFromDbError(400, err) as unknown as {
			status: number;
			data: Record<string, unknown>;
		};
		log.mockRestore();
		return r;
	};
	it('P0001 proposal is already superseded → code SUPERSEDED, 중립 문구, status 유지', () => {
		const r = call({ code: 'P0001', message: 'proposal is already superseded' });
		expect(isSupersededDbError({ code: 'P0001', message: 'proposal is already superseded' })).toBe(
			true
		);
		expect(r.status).toBe(400);
		expect(r.data).toMatchObject({
			ok: false,
			code: 'SUPERSEDED',
			status: 'superseded',
			message: ACTION_SUPERSEDED_MESSAGE
		});
		expect(ACTION_SUPERSEDED_MESSAGE).toBe('이미 새 요청으로 바뀌었어요. 새 요청을 확인해 주세요');
	});
	it.each([
		['다른 종결 상태', { code: 'P0001', message: 'proposal is already approved' }],
		['다른 code', { code: 'P0002', message: 'proposal is already superseded' }],
		['접두만 같음', { code: 'P0001', message: 'proposal is already superseded!' }],
		['code 없음', { message: 'proposal is already superseded' }]
	])('아님: %s', (_n, err) => {
		expect(isSupersededDbError(err)).toBe(false);
		const r = call(err);
		expect(r.data.code).toBeUndefined();
		expect(r.data.message).toBe(ACTION_FAILED_MESSAGE);
	});
});
