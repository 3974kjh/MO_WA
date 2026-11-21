import { beforeEach, describe, expect, it, vi } from 'vitest';

const repoMock = vi.hoisted(() => ({
	forUser: vi.fn((_sb: unknown, ownerId: string) => ({
		actor: { kind: 'user', ownerId, botClientId: null }
	})),
	getDailyBriefingMeta: vi.fn(async (_repo: unknown, date: string) => ({
		data:
			date === '2026-11-20'
				? {
						id: 'r1',
						title: '데일리 경제이슈 브리핑',
						headline: null,
						summary: null,
						report_date: date,
						tags: [],
						version: 1,
						generated_at: null,
						updated_at: '2026-11-20T08:36:00Z',
						sources: []
					}
				: null,
		error: null
	}))
}));
vi.mock('$lib/server/repo', () => repoMock);

import { load } from '../../routes/(app)/briefings/[date]/+page.server';

const locals = { user: { id: 'u1' }, supabase: {} };
// load 이벤트 중 locals·params·url만 쓰므로 최소 모양만 넘긴다.
const call = (date: string, search = '') =>
	(load as unknown as (e: unknown) => Promise<Record<string, unknown>>)({
		locals,
		params: { date },
		url: new URL(`http://x/briefings/${date}${search}`)
	});

beforeEach(() => vi.clearAllMocks());

describe('FE-04 브리핑 상세 load', () => {
	it('mode 기본은 summary, ?mode=detail은 detail, 허용 밖 값은 summary', async () => {
		expect((await call('2026-11-20')).mode).toBe('summary');
		expect((await call('2026-11-20', '?mode=detail')).mode).toBe('detail');
		expect((await call('2026-11-20', '?mode=x')).mode).toBe('summary');
	});
	it('메타만 돌려주고 본문·렌더 결과는 없다', async () => {
		const out = await call('2026-11-20');
		const b = out.briefing as Record<string, unknown>;
		expect(b.id).toBe('r1');
		for (const k of ['body_md', 'body_blocks', 'toc', 'a', 'b']) expect(b).not.toHaveProperty(k);
		expect(out).not.toHaveProperty('report');
	});
	it('날짜 형식이 틀리면 DB를 부르지 않고 404', async () => {
		await expect(call('2026-02-30')).rejects.toMatchObject({ status: 404 });
		await expect(call('latest')).rejects.toMatchObject({ status: 404 });
		expect(repoMock.getDailyBriefingMeta).not.toHaveBeenCalled();
	});
	it('없는 날짜는 404', async () => {
		await expect(call('2026-11-21')).rejects.toMatchObject({ status: 404 });
	});
});
