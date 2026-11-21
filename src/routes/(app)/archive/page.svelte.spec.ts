/**
 * FE-08 보관함 화면(client). 값은 시안 샘플과 겹치지 않는 임의 값.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';

const nav = vi.hoisted(() => ({ invalidateAll: vi.fn(async () => {}) }));
vi.mock('$app/navigation', () => nav);
vi.mock('$app/forms', () => ({ deserialize: (t: string) => JSON.parse(t) }));

import Page from './+page.svelte';
import { countArchive, toArchiveItems, type ArchivedRowsByKind } from '$lib/archive/view';

function makeData(over: Partial<ArchivedRowsByKind> = {}, extra: Record<string, unknown> = {}) {
	const items = toArchiveItems({
		reports: [
			{
				id: 'r-1',
				title: '가나 리포트',
				report_date: '2026-09-09',
				archived_at: '2026-10-10T01:00:00Z'
			}
		],
		journal_entries: [],
		positions: [
			{
				id: 'p-1',
				status: 'closed',
				archived_at: '2026-10-11T01:00:00Z',
				instruments: { ticker: 'ZZZQ', name: '다라종목' }
			}
		],
		instruments: [],
		decisions: [],
		events: [
			{
				id: 'e-1',
				title: '마바 일정',
				event_date: '2026-12-12',
				archived_at: '2026-10-12T01:00:00Z'
			}
		],
		...over
	});
	if (items[0]) items[0].archivedBy = '테스트 봇';
	for (const it of items.slice(1)) it.archivedBy = '나';
	return {
		title: '보관함',
		items,
		counts: countArchive(items),
		truncated: [],
		error: null,
		byError: false,
		...extra
	} as never;
}

const text = (el: Element | null | undefined) => el?.textContent ?? '';
const chip = (label: string) =>
	[...document.querySelectorAll('[data-testid="archive-chips"] button')].find((b) =>
		text(b).startsWith(label)
	) as HTMLButtonElement;

beforeEach(() => {
	vi.clearAllMocks();
	document.body.style.overflow = '';
});

describe('FE-08 보관함 화면', () => {
	it('열: 제목·유형·원래 위치·보관한 사람·보관한 날·복원. 영구 삭제·R-* 없음', () => {
		const { container } = render(Page, { data: makeData() });
		const heads = [...container.querySelectorAll('thead th')].map((th) => text(th).trim());
		expect(heads).toEqual(['제목', '유형', '원래 위치', '보관한 사람', '보관한 날', '복원']);
		expect(text(container)).not.toContain('영구 삭제 버튼');
		expect([...container.querySelectorAll('button')].some((b) => /삭제/.test(text(b)))).toBe(false);
		expect(text(container)).not.toMatch(/R-[A-Z]/);
		expect(container.querySelector('table.cards')).toBeTruthy();
	});

	it('유형 칩(건수)과 제목 검색으로 거른다', () => {
		const { container } = render(Page, { data: makeData() });
		expect(text(container.querySelector('[data-testid="archive-count"]'))).toBe('3건 보관 중');
		chip('일정').click();
		flushSync();
		expect(text(container.querySelector('[data-testid="archive-count"]'))).toBe('1건 보관 중');
		expect(text(container.querySelector('tbody'))).toContain('마바 일정');
		chip('일지').click();
		flushSync();
		expect(text(container)).toContain('조건에 맞는 보관 항목이 없어요');
		(
			[...container.querySelectorAll('button')].find(
				(b) => text(b) === '필터 초기화'
			) as HTMLButtonElement
		).click();
		flushSync();
		expect(text(container.querySelector('[data-testid="archive-count"]'))).toBe('3건 보관 중');
	});

	it('비어 있으면 안내 EmptyState', () => {
		const { container } = render(Page, {
			data: makeData({ reports: [], positions: [], events: [] })
		});
		expect(text(container)).toContain('보관한 항목이 없어요');
		expect(container.querySelector('table')).toBeNull();
	});

	it('복원은 확인 시트(복원할까요?)를 거쳐 ?/restore(id·table)로 보낸다', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(JSON.stringify({ type: 'success', status: 200, data: { ok: true } }))
			);
		render(Page, { data: makeData() });
		const btn = [...document.querySelectorAll('[data-action="archive-restore"]')].find((b) =>
			(b.getAttribute('aria-label') ?? '').includes('다라종목')
		) as HTMLButtonElement;
		btn.click();
		flushSync();
		expect(fetchSpy).not.toHaveBeenCalled();
		const sheet = document.querySelector('[role="dialog"]')!;
		expect(text(sheet)).toContain('복원할까요?');
		expect(text(sheet)).toContain('보유·매수 계획');
		(
			document.querySelector('[data-action="archive-restore-confirm"]') as HTMLButtonElement
		).click();
		await vi.waitFor(() => expect(nav.invalidateAll).toHaveBeenCalled());
		expect(fetchSpy.mock.calls[0][0]).toBe('/archive?/restore');
		const body = fetchSpy.mock.calls[0][1]!.body as FormData;
		expect(body.get('id')).toBe('p-1');
		expect(body.get('table')).toBe('positions');
		fetchSpy.mockRestore();
	});

	it('봇이 보관한 행은 시트에 봇 이름과 안내가 보인다', () => {
		render(Page, { data: makeData() });
		(
			[...document.querySelectorAll('[data-action="archive-restore"]')].find((b) =>
				(b.getAttribute('aria-label') ?? '').includes('가나 리포트')
			) as HTMLButtonElement
		).click();
		flushSync();
		const sheet = document.querySelector('[role="dialog"]')!;
		expect(text(sheet)).toContain('테스트 봇이(가)');
		expect(text(sheet)).toContain('봇이 보관한 항목도 직접 복원할 수 있어요');
	});

	it('일부 유형 읽기 실패는 경고 배너, 전부 비고 실패면 ErrorState', () => {
		const a = render(Page, { data: makeData({}, { error: '목록을 불러오지 못했어요.' }) });
		expect(text(a.container)).toContain('일부 유형을 불러오지 못했어요.');
		a.unmount();
		const b = render(Page, {
			data: makeData(
				{ reports: [], positions: [], events: [] },
				{ error: '목록을 불러오지 못했어요.' }
			)
		});
		expect(text(b.container)).toContain('데이터를 불러오지 못했어요');
	});
});
