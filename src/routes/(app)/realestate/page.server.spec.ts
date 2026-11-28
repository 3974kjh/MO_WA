/**
 * FE-12 /realestate load: 읽기만 · 키는 이 load로만(없으면 null) · 단지 실패=전체 오류(원문 숨김) ·
 * 가격만 실패하면 가격 없이. 키 값은 자리 표시 값만 쓴다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type AnyLoader = (...args: unknown[]) => Promise<unknown>;

const repo = vi.hoisted(() => ({
	forUser: vi.fn(() => ({})),
	listReComplexesForMap: vi.fn<AnyLoader>(),
	listRecentComplexSnapshots: vi.fn<AnyLoader>()
}));
vi.mock('$lib/server/repo', () => repo);
const env = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock('$env/dynamic/public', () => env);

import { load } from './+page.server';

const ROW = {
	id: '00000000-0000-4000-8000-000000000001',
	name: '샘플',
	sido: '경기도',
	sigungu: '파주시',
	address: null,
	lat: 37.7,
	lng: 126.73,
	households: 100,
	built_year: 2020,
	main_type: null,
	total_score: 70,
	rating: 4,
	is_target: true,
	roles: ['target']
};
const NOGEO = { ...ROW, id: '00000000-0000-4000-8000-000000000002', lat: null, lng: null };

type Out = {
	mapKeyId: string | null;
	error: string | null;
	priceError: string | null;
	items: Array<{ id: string; medPrice: number | null }>;
	located: number;
	missing: number;
	query: { tab: string };
};
const run = async (search = '') =>
	(await (load as unknown as (e: unknown) => Promise<Out>)({
		locals: { user: { id: 'u' }, supabase: {} },
		url: new URL('http://x/realestate' + search)
	})) as Out;

afterEach(() => {
	vi.clearAllMocks();
	env.env = {};
});

describe('FE-12 /realestate load', () => {
	it('키가 없으면 null, 있으면 다듬어 그대로(모양이 이상하면 null)', async () => {
		repo.listReComplexesForMap.mockResolvedValue({ data: [ROW, NOGEO], error: null });
		repo.listRecentComplexSnapshots.mockResolvedValue({ data: [], error: null });
		expect((await run()).mapKeyId).toBeNull();
		env.env = { PUBLIC_NAVER_MAP_KEY_ID: '  placeholderKey01 ' };
		expect((await run()).mapKeyId).toBe('placeholderKey01');
		env.env = { PUBLIC_NAVER_MAP_KEY_ID: 'bad key"><script>' };
		expect((await run()).mapKeyId).toBeNull();
		env.env = { PUBLIC_NAVER_MAP_KEY_ID: '' };
		expect((await run()).mapKeyId).toBeNull();
	});

	it('좌표 없는 단지는 목록에 남고 수가 따로 잡힌다 · 스냅샷은 단지 id로만', async () => {
		repo.listReComplexesForMap.mockResolvedValue({ data: [ROW, NOGEO], error: null });
		repo.listRecentComplexSnapshots.mockResolvedValue({
			data: [{ complex_id: ROW.id, as_of: '2026-11-04', med_price: 59600 }],
			error: null
		});
		const out = await run('?tab=brief');
		expect(out.query.tab).toBe('map');
		expect(out.located).toBe(1);
		expect(out.missing).toBe(1);
		expect(out.items.map((i) => i.id)).toEqual([ROW.id, NOGEO.id]);
		expect(out.items[0].medPrice).toBe(59600);
		expect(repo.listRecentComplexSnapshots).toHaveBeenCalledWith({}, [ROW.id, NOGEO.id]);
	});

	it('단지를 못 읽으면 일반 문구만(원문 숨김), 스냅샷은 읽지 않는다', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		repo.listReComplexesForMap.mockResolvedValue({
			data: [],
			error: { code: '42501', message: 'permission denied for table re_complexes' }
		});
		const out = await run();
		expect(out.error).toBe('목록을 불러오지 못했어요.');
		expect(JSON.stringify(out)).not.toContain('permission denied');
		expect(out.items).toEqual([]);
		expect(repo.listRecentComplexSnapshots).not.toHaveBeenCalled();
		err.mockRestore();
	});

	it('가격만 실패하면 가격 없이 보이고 priceError', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		repo.listReComplexesForMap.mockResolvedValue({ data: [ROW], error: null });
		repo.listRecentComplexSnapshots.mockResolvedValue({
			data: [{ complex_id: ROW.id, as_of: '2026-11-04', med_price: 1 }],
			error: { message: 'x' }
		});
		const out = await run();
		expect(out.error).toBeNull();
		expect(out.priceError).toBe('정보를 불러오지 못했어요.');
		expect(out.items[0].medPrice).toBeNull();
		err.mockRestore();
	});

	it('로그인 안 했으면 401', async () => {
		await expect(
			(load as unknown as (e: unknown) => Promise<unknown>)({
				locals: { user: null, supabase: {} },
				url: new URL('http://x/realestate')
			})
		).rejects.toMatchObject({ status: 401 });
	});
});
