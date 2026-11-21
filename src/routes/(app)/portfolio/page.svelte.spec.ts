/**
 * FE-07 변경 요청 화면 렌더(client). 값은 시안 샘플과 겹치지 않는 임의 숫자.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';

vi.mock('$app/navigation', () => ({
	beforeNavigate: () => {},
	invalidateAll: vi.fn(async () => {})
}));
vi.mock('$app/forms', () => ({ deserialize: (t: string) => JSON.parse(t) }));

import Page from './+page.svelte';
import { makeItem } from '$lib/queue/testItem';
import { toast } from '$lib/components/ui/toast.svelte';

const base = {
	title: '포트폴리오',
	pendingCount: 0,
	userEmail: null,
	queue: { items: [], total: 0 },
	queueError: null,
	history: { items: [], total: 0 },
	historyError: null,
	holdings: [],
	positionsError: null,
	attentionNeeded: [],
	attentionError: null
};

const text = (c: Element) => c.textContent ?? '';
const cardOf = (c: Element, id: string) =>
	[...c.querySelectorAll('[data-testid="queue-card"]')].find((e) =>
		e.getAttribute('aria-label')?.startsWith(id)
	) as HTMLElement;

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
	fetchSpy = vi.fn(
		async () =>
			new Response(
				JSON.stringify({
					type: 'success',
					status: 200,
					data: { ok: true, proposal: { status: 'approved' } }
				})
			)
	);
	vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('FE-07 변경 요청 렌더', () => {
	it('빈 상태: 블록마다 한국어 빈 상태, 시안 수치 없음', async () => {
		const { container } = render(Page, { data: base as never });
		const t = text(container);
		expect(t).toContain('확인할 요청이 없어요');
		expect(t).toContain('아직 보유 기록이 없어요');
		expect(t).toContain('자산 비중은 준비 중이에요');
		expect(t).not.toMatch(/P-04\d\d|295\.04|290\.98|SGOV|NAVER|알파벳|예시|충돌/);
		expect(container.querySelector('#queue')).not.toBeNull();
	});

	it('오류: 블록별 일반 문구만', async () => {
		const { container } = render(Page, {
			data: {
				...base,
				queueError: '목록을 불러오지 못했어요.',
				historyError: '목록을 불러오지 못했어요.',
				attentionError: '목록을 불러오지 못했어요.',
				positionsError: '목록을 불러오지 못했어요.'
			} as never
		});
		expect(container.querySelectorAll('[role="alert"]').length).toBeGreaterThanOrEqual(3);
		expect(text(container)).toContain('변경 요청을 불러오지 못했어요');
	});

	it('close는 고쳐서 반영 없이 3칸 + 안내, set_qty_avg는 2×2', async () => {
		const { container } = render(Page, {
			data: {
				...base,
				queue: {
					items: [
						makeItem({ id: 'a', display_id: 'P-0101' }),
						makeItem({ id: 'b', display_id: 'P-0102', change_type: 'close', proposed_values: {} })
					],
					total: 2
				}
			} as never
		});
		const a = cardOf(container, 'P-0101');
		const b = cardOf(container, 'P-0102');
		expect(a.querySelectorAll('.acts button')).toHaveLength(4);
		expect(a.querySelector('[data-action="override"]')).not.toBeNull();
		expect(b.querySelector('[data-action="override"]')).toBeNull();
		expect(b.querySelectorAll('.acts button')).toHaveLength(3);
		expect(text(b)).toContain('보유 종료는 고칠 항목이 없어');
		// 왼쪽 색 세로선 없음
		expect(getComputedStyle(a).borderLeftWidth).toBe(getComputedStyle(a).borderRightWidth);
	});

	it('미리 막힌 카드: 배지 확인 대기 유지, 반영·고쳐서 반영 aria-disabled+describedby, 확인 필요 묶음 아님', async () => {
		const { container } = render(Page, {
			data: {
				...base,
				queue: {
					items: [
						makeItem({
							id: 's',
							display_id: 'P-0201',
							approval_version: 9,
							request_values: { qty: 11 },
							live_values: { qty: 14, avg_price: 1111, currency: 'KRW' }
						})
					],
					total: 1
				}
			} as never
		});
		const c = cardOf(container, 'P-0201');
		const ok = c.querySelector('[data-action="approve"]')!;
		const ov = c.querySelector('[data-action="override"]')!;
		expect(ok.getAttribute('aria-disabled')).toBe('true');
		expect(ov.getAttribute('aria-disabled')).toBe('true');
		const note = c.querySelector('[data-testid="pre-blocked"]')!;
		expect(ok.getAttribute('aria-describedby')).toBe(note.id);
		expect(text(note)).toContain('요청 기준 11주 → 지금 14주');
		expect(text(c)).toContain('확인 대기');
		expect(text(c)).not.toContain('반영 안 됨');
		expect(c.querySelector('[data-action="hold"]')!.getAttribute('aria-disabled')).toBeNull();
		expect(container.querySelector('[data-testid="attention"]')).toBeNull();
		(ok as HTMLElement).click();
		flushSync();
		expect(document.querySelector('[data-testid="approve-confirm"]')).toBeNull();
	});

	it('서버 conflict 항목은 확인 필요 묶음 + ⚠ 반영 안 됨(기록 달라짐) + 확인했어요', async () => {
		const { container } = render(Page, {
			data: {
				...base,
				attentionNeeded: [
					makeItem({
						id: 'c',
						display_id: 'P-0301',
						status: 'conflict',
						attention_started_at: '2026-11-21T00:00:00Z'
					})
				]
			} as never
		});
		const attn = container.querySelector('[data-testid="attention"]')!;
		expect(attn).not.toBeNull();
		expect(text(attn)).toContain('반영 안 됨(기록 달라짐)');
		expect(attn.querySelector('[data-action="ack"]')).not.toBeNull();
		expect(attn.querySelector('[data-action="approve"]')).toBeNull();
	});

	it('지난 내역: 값을 고친 반영만 ✓ 반영됨 · 값 고침, 사용자 기록 수정·close는 반영됨', async () => {
		const { container } = render(Page, {
			data: {
				...base,
				history: {
					items: [
						makeItem({
							id: 'm',
							display_id: 'P-0401',
							status: 'approved',
							applied_values: { qty: 12, avg_price: 1234 },
							decision_note: '체결 수량 확인'
						}),
						makeItem({
							id: 'u',
							display_id: 'P-0402',
							status: 'approved',
							proposed_by_type: 'user',
							applied_values: { qty: 1, avg_price: 1 }
						}),
						makeItem({
							id: 's',
							display_id: 'P-0403',
							status: 'approved',
							applied_values: { qty: '13', avg_price: '1234.0000' }
						})
					],
					total: 3
				}
			} as never
		});
		const seg = [...container.querySelectorAll('.seg button')].find(
			(b) => b.textContent === '지난 내역'
		) as HTMLElement;
		seg.click();
		flushSync();
		expect(text(cardOf(container, 'P-0401'))).toContain('반영됨 · 값 고침');
		expect(text(cardOf(container, 'P-0401'))).toContain('체결 수량 확인');
		expect(text(cardOf(container, 'P-0402'))).not.toContain('값 고침');
		expect(text(cardOf(container, 'P-0402'))).toContain('(직접 수정)');
		expect(text(cardOf(container, 'P-0403'))).not.toContain('값 고침');
	});

	it('G-2: 반영은 확인 뒤 5초가 지나야 보내고, 되돌리기면 보내지 않는다', async () => {
		vi.useFakeTimers();
		const { container } = render(Page, {
			data: {
				...base,
				queue: { items: [makeItem({ id: 'g', display_id: 'P-0501' })], total: 1 }
			} as never
		});
		(cardOf(container, 'P-0501').querySelector('[data-action="approve"]') as HTMLElement).click();
		flushSync();
		(document.querySelector('[data-action="approve-confirm"]') as HTMLElement).click();
		flushSync();
		expect(cardOf(container, 'P-0501')).toBeUndefined();
		await vi.advanceTimersByTimeAsync(4900);
		expect(fetchSpy).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('?/approve');
		const body = init.body as FormData;
		expect(body.get('id')).toBe('g');
		expect(body.has('overrides')).toBe(false);
	});

	it('G-2: 되돌리기·pagehide면 요청을 보내지 않는다', async () => {
		vi.useFakeTimers();
		const { container } = render(Page, {
			data: {
				...base,
				queue: {
					items: [
						makeItem({ id: 'x', display_id: 'P-0601' }),
						makeItem({ id: 'y', display_id: 'P-0602' })
					],
					total: 2
				}
			} as never
		});
		(cardOf(container, 'P-0601').querySelector('[data-action="approve"]') as HTMLElement).click();
		flushSync();
		(document.querySelector('[data-action="approve-confirm"]') as HTMLElement).click();
		flushSync();
		// ToastHost는 루트 레이아웃에 있으므로 토스트 store의 '되돌리기' 동작을 직접 누른다.
		const undo = toast.items.findLast((t) => t.action?.label === '되돌리기');
		expect(undo).toBeDefined();
		undo!.action!.onclick();
		flushSync();
		expect(cardOf(container, 'P-0601')).toBeDefined();

		(cardOf(container, 'P-0602').querySelector('[data-action="approve"]') as HTMLElement).click();
		flushSync();
		(document.querySelector('[data-action="approve-confirm"]') as HTMLElement).click();
		flushSync();
		window.dispatchEvent(new Event('pagehide'));
		await vi.advanceTimersByTimeAsync(6000);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('거절은 확인 뒤 바로 보낸다(5초 유예 없음)', async () => {
		vi.useFakeTimers();
		const { container } = render(Page, {
			data: {
				...base,
				queue: { items: [makeItem({ id: 'r', display_id: 'P-0701' })], total: 1 }
			} as never
		});
		(cardOf(container, 'P-0701').querySelector('[data-action="reject"]') as HTMLElement).click();
		flushSync();
		(document.querySelector('[data-action="reject-confirm"]') as HTMLElement).click();
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect((fetchSpy.mock.calls[0] as [string])[0]).toBe('?/reject');
	});

	it('고쳐서 반영: 허용 키 입력만, 확인 → 5초 뒤 overrides JSON + note', async () => {
		vi.useFakeTimers();
		const { container } = render(Page, {
			data: {
				...base,
				queue: { items: [makeItem({ id: 'o', display_id: 'P-0801' })], total: 1 }
			} as never
		});
		(cardOf(container, 'P-0801').querySelector('[data-action="override"]') as HTMLElement).click();
		flushSync();
		const sheet = document.querySelector('[data-testid="override-edit"]') as HTMLElement;
		const inputs = [...sheet.querySelectorAll('input, select')] as HTMLInputElement[];
		const labels = inputs.map((i) => i.getAttribute('aria-label'));
		expect(labels).toEqual(['내가 고친 수량', '내가 고친 평균 단가', null]);
		expect(text(sheet)).not.toMatch(/내가 고친 통화/);
		const next = document.querySelector('[data-action="override-next"]') as HTMLElement;
		expect(next.getAttribute('aria-disabled')).toBe('true');
		inputs[0].value = '12';
		inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
		inputs[2].value = '체결 수량 확인';
		inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(next.getAttribute('aria-disabled')).toBeNull();
		next.click();
		flushSync();
		expect(document.querySelector('[data-testid="override-confirm"]')).not.toBeNull();
		(document.querySelector('[data-action="override-submit"]') as HTMLElement).click();
		flushSync();
		await vi.advanceTimersByTimeAsync(4000);
		expect(fetchSpy).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1100);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const body = (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as FormData;
		expect(JSON.parse(String(body.get('overrides')))).toEqual({ qty: 12 });
		expect(body.get('note')).toBe('체결 수량 확인');
	});

	it('확인했어요는 바로 ?/ack(kind=position)', async () => {
		const { container } = render(Page, {
			data: {
				...base,
				attentionNeeded: [makeItem({ id: 'k', display_id: 'P-0901', status: 'expired' })]
			} as never
		});
		(container.querySelector('[data-action="ack"]') as HTMLElement).click();
		await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('?/ack');
		expect((init.body as FormData).get('kind')).toBe('position');
	});

	it('기록 수정: 보유 행에서 시작, 확인 뒤 5초가 지나야 ?/correct(base_version·client_ref 포함)', async () => {
		vi.useFakeTimers();
		const { container } = render(Page, {
			data: {
				...base,
				holdings: [
					{
						id: 'pos-9',
						name: '보유종목',
						status: 'holding',
						currency: 'KRW',
						qty: 7,
						avg_price: 3333,
						approval_version: 5,
						asset_type: 'stock'
					}
				]
			} as never
		});
		(container.querySelector('[data-action="correct"]') as HTMLElement).click();
		flushSync();
		const sheet = document.querySelector('[data-testid="correction-edit"]') as HTMLElement;
		expect(text(sheet)).not.toMatch(/고쳐서 반영|값 고침/);
		const [, qty, , , reason] = [...sheet.querySelectorAll('input, select')] as HTMLInputElement[];
		qty.value = '8';
		qty.dispatchEvent(new Event('input', { bubbles: true }));
		reason.value = '증권사 앱 확인';
		reason.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		(document.querySelector('[data-action="correction-next"]') as HTMLElement).click();
		flushSync();
		(document.querySelector('[data-action="correction-submit"]') as HTMLElement).click();
		flushSync();
		expect(text(container)).toContain('8주');
		await vi.advanceTimersByTimeAsync(4900);
		expect(fetchSpy).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(200);
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('?/correct');
		const body = init.body as FormData;
		expect(body.get('position_id')).toBe('pos-9');
		expect(body.get('qty')).toBe('8');
		expect(body.get('base_version')).toBe('5');
		expect(String(body.get('client_ref'))).toMatch(/^[0-9a-f-]{36}$/);
	});
});
