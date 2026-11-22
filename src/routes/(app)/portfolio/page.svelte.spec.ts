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
import { makeItem } from '../../../../tests/queue/testItem';
import { makeRow } from '$lib/portfolio/testRow';
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
	portfolio: { rows: [], totalKrw: null, usdkrw: null, holdCount: 0 },
	portfolioError: null,
	valuationError: null,
	attentionNeeded: [],
	attentionError: null
};

const NOTICE = '최근 50건만 보여드려요. 처리하면 나머지가 보여요.';
const attnItems = (n: number) =>
	Array.from({ length: n }, (_, i) =>
		makeItem({
			id: `at${i}`,
			display_id: `P-${String(7000 + i)}`,
			status: 'conflict',
			attention_started_at: '2026-11-21T00:00:00Z'
		})
	);
const occurrences = (t: string, needle: string) => t.split(needle).length - 1;

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
		expect(t).toContain('비중을 낼 평가금액이 없어요');
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

	it('서버 conflict 항목은 확인 필요 묶음 + ⚠ 반영 안 됨(보유가 달라짐) + 확인했어요', async () => {
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
		expect(text(attn)).toContain('반영 안 됨(보유가 달라짐)');
		expect(text(attn)).toContain('반영 안 된 요청이 있어요(보유가 달라짐·기한 지남)');
		expect(text(attn)).not.toContain('기록 달라짐');
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

	it('확인 필요 잘림 안내: 50건이면 없음, 51건 이상이면 정확한 문구 1회, 배지 숫자는 실제 건수', async () => {
		const at50 = render(Page, {
			data: {
				...base,
				attentionNeeded: attnItems(50),
				attentionShown: 50,
				attentionTotal: 50
			} as never
		});
		expect(text(at50.container)).not.toContain('보여드려요');
		expect(at50.container.querySelector('[data-testid="attention-truncated"]')).toBeNull();
		expect(text(at50.container.querySelector('.attn .count')!)).toBe('50건');
		at50.unmount();

		const at51 = render(Page, {
			data: {
				...base,
				attentionNeeded: attnItems(50),
				attentionShown: 50,
				attentionTotal: 83
			} as never
		});
		const attn = at51.container.querySelector('[data-testid="attention"]')!;
		expect(occurrences(text(attn), NOTICE)).toBe(1);
		const note = attn.querySelector('[data-testid="attention-truncated"]')!;
		expect(text(note).trim()).toBe(NOTICE);
		// 안내는 목록(.cards) 바로 아래
		expect(attn.querySelector('.cards')!.nextElementSibling).toBe(note);
		// 배지는 잘린 목록 길이(50)가 아니라 실제 건수
		expect(text(attn.querySelector('.count')!)).toBe('83건');
	});

	it('확인 필요 잘림 안내: 경계 51건이면 안내, 건수 조회 실패(목록 길이로 대체)면 안내 없음', async () => {
		const at51 = render(Page, {
			data: {
				...base,
				attentionNeeded: attnItems(50),
				attentionShown: 50,
				attentionTotal: 51
			} as never
		});
		expect(occurrences(text(at51.container), NOTICE)).toBe(1);
		expect(text(at51.container.querySelector('.attn .count')!)).toBe('51건');
		at51.unmount();
		const few = render(Page, {
			data: {
				...base,
				attentionNeeded: attnItems(3),
				attentionShown: 3,
				attentionTotal: 3
			} as never
		});
		expect(text(few.container)).not.toContain('보여드려요');
		few.unmount();
		// 총건수가 정확히 50이면(보여 준 건수가 더 적어도) 50 초과가 아니므로 안내 없음
		const edge = render(Page, {
			data: {
				...base,
				attentionNeeded: attnItems(49),
				attentionShown: 49,
				attentionTotal: 50
			} as never
		});
		expect(text(edge.container)).not.toContain('보여드려요');
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
				],
				portfolio: {
					...base.portfolio,
					rows: [makeRow({ id: 'pos-9', name: '보유종목', qty: 7, avg_price: 3333 })]
				}
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

	const principleItem = (over: Parameters<typeof makeItem>[0] = {}) =>
		makeItem({
			kind: 'principle',
			change_type: 'principle',
			display_id: 'R-0031',
			base_version: 4,
			approval_version: null,
			proposed_values: {},
			request_values: null,
			live_values: null,
			position_id: null,
			name: null,
			ticker: null,
			asset_type: null,
			clause_ref: '2-1',
			body_preview: '새 원칙 본문 줄',
			reason: '원칙 이유 줄',
			...over
		});

	it('원칙 개정 요청: R- 번호, 본문은 평문, 고쳐서 반영 없이 반영·보류·거절 3칸', async () => {
		const { container } = render(Page, {
			data: {
				...base,
				queue: {
					items: [
						principleItem({ id: 'p1' }),
						principleItem({
							id: 'p2',
							display_id: 'R-0032',
							status: 'on_hold',
							body_preview: '<b>굵게</b>'
						})
					],
					total: 2
				}
			} as never
		});
		const c = cardOf(container, 'R-0031');
		expect(c).toBeDefined();
		expect(c.getAttribute('data-kind')).toBe('principle');
		expect(text(c)).toContain('투자 원칙 개정 · 2-1');
		expect(text(c)).toContain('새 원칙 본문 줄');
		expect(text(c)).toContain('원칙 이유 줄');
		expect(c.querySelector('[data-action="override"]')).toBeNull();
		expect(c.querySelector('[data-action="approve"]')?.getAttribute('aria-disabled')).toBeNull();
		expect(c.querySelectorAll('.acts button')).toHaveLength(3);
		const held = cardOf(container, 'R-0032');
		expect(held.querySelector('[data-action="unhold"]')?.textContent).toContain('대기로 되돌리기');
		// 본문은 평문: 태그가 요소로 만들어지지 않는다
		expect(held.querySelector('[data-testid="principle-body"] b')).toBeNull();
		expect(text(held)).toContain('<b>굵게</b>');
		expect(text(container)).not.toContain('충돌');
	});

	it('G-2: 원칙 반영도 5초 뒤 ?/approvePrinciple(id만), 되돌리기·pagehide면 보내지 않는다', async () => {
		vi.useFakeTimers();
		const { container } = render(Page, {
			data: {
				...base,
				queue: {
					items: [
						principleItem({ id: 'pa', display_id: 'R-0041' }),
						principleItem({ id: 'pb', display_id: 'R-0042' }),
						principleItem({ id: 'pc', display_id: 'R-0043' })
					],
					total: 3
				}
			} as never
		});
		const approve = (id: string) => {
			(cardOf(container, id).querySelector('[data-action="approve"]') as HTMLElement).click();
			flushSync();
			expect(document.querySelector('[data-testid="principle-body"]')).not.toBeNull();
			(document.querySelector('[data-action="approve-confirm"]') as HTMLElement).click();
			flushSync();
		};
		approve('R-0041');
		expect(cardOf(container, 'R-0041')).toBeUndefined();
		toast.items.findLast((t) => t.action?.label === '되돌리기')!.action!.onclick();
		flushSync();
		expect(cardOf(container, 'R-0041')).toBeDefined();
		await vi.advanceTimersByTimeAsync(6000);
		expect(fetchSpy).not.toHaveBeenCalled();

		approve('R-0042');
		window.dispatchEvent(new Event('pagehide'));
		await vi.advanceTimersByTimeAsync(6000);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('G-2: 원칙 반영은 4.9초엔 안 보내고 5초 뒤 한 번 보낸다', async () => {
		vi.useFakeTimers();
		const { container } = render(Page, {
			data: {
				...base,
				queue: { items: [principleItem({ id: 'pd', display_id: 'R-0044' })], total: 1 }
			} as never
		});
		(cardOf(container, 'R-0044').querySelector('[data-action="approve"]') as HTMLElement).click();
		flushSync();
		(document.querySelector('[data-action="approve-confirm"]') as HTMLElement).click();
		flushSync();
		await vi.advanceTimersByTimeAsync(4900);
		expect(fetchSpy).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('?/approvePrinciple');
		const body = init.body as FormData;
		expect([...body.keys()]).toEqual(['id']);
		expect(body.get('id')).toBe('pd');
	});

	it('원칙 거절(확인 뒤 즉시)·보류·대기로 되돌리기는 ?/decidePrinciple, 확인했어요는 ?/ack kind=principle', async () => {
		vi.useFakeTimers();
		const { container } = render(Page, {
			data: {
				...base,
				queue: {
					items: [
						principleItem({ id: 'r1', display_id: 'R-0051' }),
						principleItem({ id: 'r2', display_id: 'R-0052' }),
						principleItem({ id: 'r3', display_id: 'R-0053', status: 'on_hold' })
					],
					total: 3
				},
				attentionNeeded: [
					principleItem({
						id: 'r4',
						display_id: 'R-0054',
						status: 'conflict',
						body_truncated: true
					})
				]
			} as never
		});
		(cardOf(container, 'R-0051').querySelector('[data-action="reject"]') as HTMLElement).click();
		flushSync();
		(document.querySelector('[data-action="reject-confirm"]') as HTMLElement).click();
		await vi.advanceTimersByTimeAsync(0);
		(cardOf(container, 'R-0052').querySelector('[data-action="hold"]') as HTMLElement).click();
		await vi.advanceTimersByTimeAsync(0);
		(cardOf(container, 'R-0053').querySelector('[data-action="unhold"]') as HTMLElement).click();
		await vi.advanceTimersByTimeAsync(0);
		const att = cardOf(container, 'R-0054');
		expect(text(att)).toContain('반영 안 됨(보유가 달라짐)');
		// 확인 필요 원칙 카드도 본문 평문 미리보기를 보인다
		expect(att.querySelector('[data-testid="principle-body"]')).not.toBeNull();
		expect(text(att)).toContain('새 원칙 본문 줄');
		expect(text(att)).toContain('본문이 길어 앞부분만 보여요');
		(att.querySelector('[data-action="ack"]') as HTMLElement).click();
		await vi.advanceTimersByTimeAsync(0);
		const calls = (fetchSpy.mock.calls as [string, RequestInit][]).map(([u, i]) => [
			u,
			Object.fromEntries((i.body as FormData).entries())
		]);
		expect(calls).toEqual([
			['?/decidePrinciple', { id: 'r1', action: 'reject' }],
			['?/decidePrinciple', { id: 'r2', action: 'hold' }],
			['?/decidePrinciple', { id: 'r3', action: 'unhold' }],
			['?/ack', { id: 'r4', kind: 'principle' }]
		]);
	});

	it('포지션 그대로 반영 409는 확인 필요로 옮기고 중립 토스트(시트 없음, 일반 오류 토스트 아님)', async () => {
		vi.useFakeTimers();
		fetchSpy.mockImplementation(
			async () =>
				new Response(
					JSON.stringify({
						type: 'failure',
						status: 409,
						data: { ok: false, code: 'CONFLICT', status: 'conflict', message: 'x' }
					})
				)
		);
		const { container } = render(Page, {
			data: {
				...base,
				queue: { items: [makeItem({ id: 'pc', display_id: 'P-0601' })], total: 1 }
			} as never
		});
		(cardOf(container, 'P-0601').querySelector('[data-action="approve"]') as HTMLElement).click();
		flushSync();
		(document.querySelector('[data-action="approve-confirm"]') as HTMLElement).click();
		flushSync();
		await vi.advanceTimersByTimeAsync(5100);
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('?/approve');
		expect((init.body as FormData).has('overrides')).toBe(false);
		await vi.waitFor(() =>
			expect(
				toast.items.some((t) => t.message === '반영 안 됨(보유가 달라짐) · ‘확인 필요’로 옮겼어요')
			).toBe(true)
		);
		const conflictToast = toast.items.find((t) => t.message.includes('반영 안 됨'))!;
		expect(conflictToast.tone).not.toBe('err');
		// 화면 안에서 '확인 필요' 묶음으로 옮겨진다(페이지 이동 없음).
		await vi.waitFor(() => {
			const attn = container.querySelector('[data-testid="attention"]');
			expect(attn).not.toBeNull();
			expect(text(attn!)).toContain('P-0601');
		});
		// 시트는 열리지 않는다(그대로 반영이라 고쳐서 반영 시트 경로 아님).
		expect(document.querySelector('[data-testid="override-edit"]')).toBeNull();
	});

	it('원칙 반영 409는 확인 필요로 옮기고 중립 토스트(시트 없음)', async () => {
		vi.useFakeTimers();
		fetchSpy.mockImplementation(
			async () =>
				new Response(
					JSON.stringify({
						type: 'failure',
						status: 409,
						data: { ok: false, code: 'CONFLICT', status: 'conflict', message: 'x' }
					})
				)
		);
		const { container } = render(Page, {
			data: {
				...base,
				queue: { items: [principleItem({ id: 'rc', display_id: 'R-0061' })], total: 1 }
			} as never
		});
		(cardOf(container, 'R-0061').querySelector('[data-action="approve"]') as HTMLElement).click();
		flushSync();
		(document.querySelector('[data-action="approve-confirm"]') as HTMLElement).click();
		flushSync();
		await vi.advanceTimersByTimeAsync(5100);
		expect((fetchSpy.mock.calls[0] as [string])[0]).toBe('?/approvePrinciple');
		await vi.waitFor(() =>
			expect(toast.items.some((t) => t.message.includes('확인 필요'))).toBe(true)
		);
		expect(document.querySelector('[data-testid="override-edit"]')).toBeNull();
	});
});
