import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIST_LOAD_ERROR, publicListError } from './listError';

afterEach(() => vi.restoreAllMocks());

describe('FE-10 Low-2 목록 오류는 원문 대신 일반 문구', () => {
	it('오류가 없으면 null', () => {
		expect(publicListError('briefings', null)).toBeNull();
	});
	it('DB 오류 원문은 돌려주지 않고 서버 로그에만 남긴다', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const raw = { code: '22P02', message: 'malformed array literal: "{a}}"' };
		const out = publicListError('briefings', raw);
		expect(out).toBe(LIST_LOAD_ERROR);
		expect(out).not.toContain('malformed');
		expect(log).toHaveBeenCalledWith('[briefings] list load failed', {
			code: '22P02',
			message: raw.message
		});
	});
});
