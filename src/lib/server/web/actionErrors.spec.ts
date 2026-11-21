import { describe, expect, it, vi } from 'vitest';

vi.mock('@sveltejs/kit', async () => {
	const actual = await vi.importActual<typeof import('@sveltejs/kit')>('@sveltejs/kit');
	return { ...actual, fail: (status: number, data: unknown) => ({ status, data }) };
});

import { ACTION_FAILED_MESSAGE, failFromDbError } from './actionErrors';

describe('failFromDbError는 원문·code를 payload에 싣지 않는다', () => {
	it('일반 문구만, 원문은 서버 로그', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = failFromDbError(400, {
			message: 'duplicate key tbl_x',
			code: '23505'
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
	it('extra의 code(CONFLICT 등)는 유지', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = failFromDbError(409, { message: 'x' }, { code: 'CONFLICT' }) as unknown as {
			data: { code?: string };
		};
		expect(r.data.code).toBe('CONFLICT');
	});
});
