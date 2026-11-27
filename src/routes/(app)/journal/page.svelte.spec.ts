/**
 * FE-06 매매일지 화면(client). 값은 시안 샘플과 겹치지 않는 임의 값.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';

const nav = vi.hoisted(() => ({
	pushState: vi.fn(),
	replaceState: vi.fn(),
	goto: vi.fn(async () => {}),
	invalidateAll: vi.fn(async () => {}),
	beforeNavigate: () => {}
}));
vi.mock('$app/navigation', () => nav);
vi.mock('$app/forms', () => ({ deserialize: (t: string) => JSON.parse(t) }));
const pageMock = vi.hoisted(() => ({
	url: new URL('http://x/journal'),
	state: {} as { journalId?: string | null; journalFromList?: boolean }
}));
vi.mock('$app/state', () => ({ page: pageMock }));
const mq = vi.hoisted(() => ({ pc: false }));
vi.mock('svelte/reactivity', async (orig) => {
	const actual = await orig<typeof import('svelte/reactivity')>();
	return {
		...actual,
		MediaQuery: class {
			get current() {
				return mq.pc;
			}
		}
	};
});

import Page from './+page.svelte';
import DetailPage from './[id]/+page.svelte';
import { countKinds, toJournalItem, type InstrumentOption } from '$lib/journal/view';
import { resetOpenSheets } from '$lib/components/ui/sheetStack';

const I1 = '11111111-1111-4111-8111-111111111111';
const I2 = '22222222-2222-4222-8222-222222222222';
const instruments: InstrumentOption[] = [
	{
		id: 'i-a',
		ticker: '000111',
		name: '가나종목',
		market: 'KRX',
		asset_type: 'stock',
		archived: false
	},
	{
		id: 'i-b',
		ticker: 'QQQX',
		name: '라마종목',
		market: 'NASDAQ',
		asset_type: 'etf',
		archived: false
	}
];
const ctx = {
	instruments: new Map(instruments.map((i) => [i.id, i])),
	botNames: new Map([['bot-1', '테스트 봇']])
};
const items = [
	toJournalItem(
		{
			id: I1,
			entry_date: '2026-10-07',
			kind: 'buy',
			state: 'done',
			title: '가나 3주 매수 기록',
			instrument_id: 'i-a',
			tickers: ['000111'],
			price: 1234567,
			qty: 3,
			currency: 'KRW',
			source_bot_id: null
		},
		ctx
	),
	toJournalItem(
		{
			id: I2,
			entry_date: '2026-10-05',
			kind: 'thought',
			state: 'hold',
			title: '라마 관찰 메모',
			tickers: ['QQQX'],
			memo_md: '봇이 남긴 메모',
			source_bot_id: 'bot-1'
		},
		ctx
	)
];

function makeData(over: Record<string, unknown> = {}) {
	return {
		title: '매매일지',
		user: null,
		query: { type: '', ticker: '', view: 'tl', q: '' },
		journal: { items, page: 1, pageSize: 30, total: 2, totalPages: 1 },
		kindCounts: countKinds(['buy', 'thought', 'thought', 'review']),
		kindCountsOk: true,
		instruments,
		reports: [],
		selected: null,
		error: null,
		auxError: null,
		...over
	} as never;
}

const text = (el: Element | null | undefined) => el?.textContent ?? '';
const chip = (c: Element, label: string) =>
	[...c.querySelectorAll('[data-testid="journal-chips"] button')].find((b) =>
		text(b).startsWith(label)
	) as HTMLButtonElement;

beforeEach(() => {
	vi.clearAllMocks();
	pageMock.url = new URL('http://x/journal');
	pageMock.state = {};
	mq.pc = false;
	document.body.style.overflow = '';
	resetOpenSheets();
	document.querySelectorAll('.sheet-root').forEach((n) => n.remove());
});

describe('FE-06 매매일지 목록', () => {
	it('기본 보기는 타임라인, ?view=tb일 때만 표', () => {
		const tl = render(Page, { data: makeData() });
		expect(tl.container.querySelector('[data-testid="journal-timeline"]')).toBeTruthy();
		expect(tl.container.querySelector('[data-testid="journal-table"]')).toBeNull();
		tl.unmount();
		const tb = render(Page, {
			data: makeData({ query: { type: '', ticker: '', view: 'tb', q: '' } })
		});
		expect(tb.container.querySelector('[data-testid="journal-table"]')).toBeTruthy();
		expect(tb.container.querySelector('[data-testid="journal-timeline"]')).toBeNull();
	});

	it('구분 칩 5종 + 전체: 건수와 aria-pressed', () => {
		const { container } = render(Page, {
			data: makeData({ query: { type: 'thought', ticker: '', view: 'tl', q: '' } })
		});
		const chips = container.querySelectorAll('[data-testid="journal-chips"] button');
		expect(chips.length).toBe(6);
		expect(text(chip(container, '전체'))).toContain('4');
		expect(text(chip(container, '생각·판단'))).toContain('2');
		expect(text(chip(container, '매도'))).toContain('0');
		expect(chip(container, '생각·판단').getAttribute('aria-pressed')).toBe('true');
		expect(chip(container, '전체').getAttribute('aria-pressed')).toBe('false');
		for (const l of ['매수', '매도', '계획', '점검']) {
			expect(chip(container, l).getAttribute('aria-pressed')).toBe('false');
		}
	});

	it('건수를 못 읽으면 칩에 숫자를 붙이지 않는다', () => {
		const { container } = render(Page, { data: makeData({ kindCountsOk: false }) });
		expect(text(chip(container, '매수')).trim()).toBe('매수');
	});

	it('필터 결과 건수는 aria-live', () => {
		const { container } = render(Page, { data: makeData() });
		const c = container.querySelector('[data-testid="journal-count"]')!;
		expect(c.getAttribute('aria-live')).toBe('polite');
		expect(text(c)).toBe('2건');
	});

	it('봇 배지는 봇이 쓴 행에만', () => {
		const { container } = render(Page, { data: makeData() });
		const cards = [...container.querySelectorAll('.tl-card')];
		expect(cards[0].querySelector('[data-testid="bot-badge"]')).toBeNull();
		expect(text(cards[1].querySelector('[data-testid="bot-badge"]'))).toContain('테스트 봇');
	});

	it('가격은 단가 전체 값(만 원 축약 안 함)', () => {
		const { container } = render(Page, { data: makeData() });
		const card = container.querySelector('.tl-card')!;
		expect(text(card)).toContain('1,234,567');
		expect(text(card)).not.toContain('만');
		expect(text(card)).toContain('3주');
	});

	it('G-10 상태 라벨: hold=보류, done=실행', () => {
		const { container } = render(Page, { data: makeData() });
		const cards = [...container.querySelectorAll('.tl-card')];
		expect(text(cards[0])).toContain('실행');
		expect(text(cards[1])).toContain('보류');
	});

	it('빈 목록 + 필터면 필터 초기화(샘플 숫자로 채우지 않음)', () => {
		const { container } = render(Page, {
			data: makeData({
				query: { type: 'sell', ticker: '', view: 'tl', q: '' },
				journal: { items: [], page: 1, pageSize: 30, total: 0, totalPages: 0 }
			})
		});
		expect(text(container)).toContain('조건에 맞는 일지가 없어요');
		expect(text(container)).toContain('필터 초기화');
	});
});

describe('FE-06 상세 URL(shallow routing)', () => {
	it('카드를 누르면 /journal/[id]?쿼리 로 pushState', () => {
		pageMock.url = new URL('http://x/journal?type=buy&view=tb');
		const { container } = render(Page, { data: makeData() });
		(container.querySelector(`[data-id="${I1}"]`) as HTMLButtonElement).click();
		expect(nav.pushState).toHaveBeenCalledWith(`/journal/${I1}?type=buy&view=tb`, {
			journalId: I1,
			journalFromList: true
		});
	});

	it('page.state.journalId면 모바일 전체 시트로 상세, 이전/다음은 replaceState', () => {
		pageMock.url = new URL(`http://x/journal/${I1}`);
		pageMock.state = { journalId: I1, journalFromList: true };
		render(Page, { data: makeData() });
		const detail = document.querySelector('[data-testid="journal-detail"]')!;
		expect(detail.getAttribute('data-id')).toBe(I1);
		expect(text(detail.querySelector('[data-testid="journal-position"]'))).toBe('1 / 2');
		expect(text(document.querySelector('.sheet.full.open'))).toContain('목록으로');
		(detail.querySelector('[aria-label="다음 일지"]') as HTMLButtonElement).click();
		expect(nav.replaceState).toHaveBeenCalledWith(`/journal/${I2}`, {
			journalId: I2,
			journalFromList: true
		});
		expect((detail.querySelector('[aria-label="이전 일지"]') as HTMLButtonElement).disabled).toBe(
			true
		);
	});

	it('pushState로 연 상세는 Esc로 닫으면 history.back()', () => {
		const back = vi.spyOn(history, 'back').mockImplementation(() => {});
		pageMock.state = { journalId: I1, journalFromList: true };
		render(Page, { data: makeData() });
		const sheet = document.querySelector('.sheet.full.open') as HTMLElement;
		sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(back).toHaveBeenCalled();
		back.mockRestore();
	});

	it('/journal/[id] 직접 진입: 서버 selected로 상세가 렌더되고, 닫으면 목록 URL로 pushState', () => {
		pageMock.url = new URL(`http://x/journal/${I2}?ticker=QQQX`);
		const { container } = render(DetailPage, { data: makeData({ selected: items[1] }) });
		expect(container.querySelector('[data-testid="journal-timeline"]')).toBeTruthy();
		const detail = document.querySelector('[data-testid="journal-detail"]')!;
		expect(detail.getAttribute('data-id')).toBe(I2);
		expect(text(detail)).toContain('봇이 남긴 메모');
		(document.querySelector('.sheet.full.open .back') as HTMLButtonElement).click();
		expect(nav.pushState).toHaveBeenCalledWith('/journal?ticker=QQQX', { journalId: null });
	});

	it('직접 진입 뒤 이전/다음으로 옮겨도 닫기는 history.back이 아니라 목록 URL', () => {
		const back = vi.spyOn(history, 'back').mockImplementation(() => {});
		pageMock.url = new URL(`http://x/journal/${I2}`);
		pageMock.state = { journalId: I2, journalFromList: false };
		render(DetailPage, { data: makeData({ selected: items[1] }) });
		(document.querySelector('.sheet.full.open .back') as HTMLButtonElement).click();
		expect(back).not.toHaveBeenCalled();
		expect(nav.pushState).toHaveBeenCalledWith('/journal', { journalId: null });
		back.mockRestore();
	});

	it('목록 쪽에 없는 행도 직접 진입하면 상세가 보인다(이전/다음 없음)', () => {
		const other = {
			...items[0],
			id: '33333333-3333-4333-8333-333333333333',
			title: '다른 쪽 일지'
		};
		render(DetailPage, { data: makeData({ selected: other }) });
		const detail = document.querySelector('[data-testid="journal-detail"]')!;
		expect(text(detail)).toContain('다른 쪽 일지');
		expect(detail.querySelector('[data-testid="journal-position"]')).toBeNull();
	});

	it('PC(≥1024)는 우측 패널에 상세(시트 없음)', () => {
		mq.pc = true;
		pageMock.state = { journalId: I1 };
		const { container } = render(Page, { data: makeData() });
		const panel = container.querySelector('[data-testid="journal-panel"]')!;
		expect(panel.querySelector('[data-testid="journal-detail"]')?.getAttribute('data-id')).toBe(I1);
		expect(document.querySelector('.sheet.full.open')).toBeNull();
	});

	it('상세 가격은 Money kind=unit(행 통화 전체 값)', () => {
		pageMock.state = { journalId: I1 };
		render(Page, { data: makeData() });
		expect(text(document.querySelector('[data-testid="journal-price"]')).trim()).toBe(
			'1,234,567원'
		);
	});
});

describe('FE-06 작성 폼', () => {
	function openForm() {
		const btn = [...document.querySelectorAll('button')].find((b) => text(b) === '일지 쓰기')!;
		btn.click();
		flushSync();
		return document.querySelector('[data-testid="journal-form"]') as HTMLFormElement;
	}

	it('매수는 종목·가격·수량·통화 필수, 오류는 aria-describedby로 연결(규칙 번호는 화면에 없음)', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		render(Page, { data: makeData() });
		const form = openForm();
		const kind = form.querySelector('select[name="kind"]') as HTMLSelectElement;
		kind.value = 'buy';
		kind.dispatchEvent(new Event('change', { bubbles: true }));
		const title = form.querySelector('input[name="title"]') as HTMLInputElement;
		title.value = '테스트 매수';
		title.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		form.requestSubmit();
		flushSync();
		for (const name of ['instrument_id', 'price', 'qty', 'currency']) {
			const el = form.querySelector(`[name="${name}"]`)!;
			expect(el.getAttribute('aria-invalid'), name).toBe('true');
			const id = el.getAttribute('aria-describedby')!;
			const msg = document.getElementById(id.split(' ')[0])!;
			expect(text(msg).length, name).toBeGreaterThan(0);
			expect(msg.getAttribute('data-rule'), name).toBe('R-VAL-J02');
			expect(text(msg)).not.toMatch(/R-VAL/);
		}
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it('생각·판단은 종목 없이도 통과하고 연결 종목은 instruments 코드만 고를 수 있다', () => {
		render(Page, { data: makeData() });
		const form = openForm();
		const sel = form.querySelector('select[name="tickers"]') as HTMLSelectElement;
		const codes = [...sel.options].map((o) => o.value).filter(Boolean);
		expect(codes).toEqual(['000111', 'QQQX']);
		expect(form.querySelector('[name="instrument_id"]')?.getAttribute('aria-required')).toBeNull();
	});

	it('저장 성공(매수)은 포지션 반영 안내 토스트 + invalidateAll', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(
					JSON.stringify({ type: 'success', status: 200, data: { ok: true, id: I1, trade: true } })
				)
			);
		const { toast } = await import('$lib/components/ui/toast.svelte');
		render(Page, { data: makeData() });
		const form = openForm();
		const set = (name: string, value: string, ev = 'input') => {
			const el = form.querySelector(`[name="${name}"]`) as HTMLInputElement;
			el.value = value;
			el.dispatchEvent(new Event(ev, { bubbles: true }));
		};
		set('kind', 'buy', 'change');
		flushSync();
		set('title', '가나 매수');
		set('instrument_id', 'i-a', 'change');
		set('price', '70100');
		set('qty', '2');
		flushSync();
		expect((form.querySelector('[name="currency"]') as HTMLSelectElement).value).toBe('KRW');
		form.requestSubmit();
		await vi.waitFor(() => expect(nav.invalidateAll).toHaveBeenCalled());
		expect(fetchSpy.mock.calls[0][0]).toBe('/journal?/create');
		const body = fetchSpy.mock.calls[0][1]!.body as FormData;
		expect(body.get('kind')).toBe('buy');
		expect(body.get('client_ref')).toBeTruthy();
		expect(body.get('owner_id')).toBeNull();
		expect(toast.items.some((t) => t.message.includes('포지션 반영은 변경 요청에서'))).toBe(true);
		fetchSpy.mockRestore();
	});

	it('봇이 쓴 행도 수정 폼이 열리고 ?/update로 보낸다', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(
					JSON.stringify({ type: 'success', status: 200, data: { ok: true, id: I2, trade: false } })
				)
			);
		pageMock.state = { journalId: I2 };
		render(Page, { data: makeData() });
		const edit = [...document.querySelectorAll('[data-testid="journal-detail"] button')].find(
			(b) => text(b) === '수정'
		) as HTMLButtonElement;
		edit.click();
		flushSync();
		const form = document.querySelector('[data-testid="journal-form"]') as HTMLFormElement;
		expect((form.querySelector('[name="title"]') as HTMLInputElement).value).toBe('라마 관찰 메모');
		form.requestSubmit();
		await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		expect(fetchSpy.mock.calls[0][0]).toBe('/journal?/update');
		expect((fetchSpy.mock.calls[0][1]!.body as FormData).get('id')).toBe(I2);
		fetchSpy.mockRestore();
	});

	it('보관은 확인 시트를 거쳐 ?/archive(journal_entries)', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(JSON.stringify({ type: 'success', status: 200, data: { ok: true } }))
			);
		pageMock.state = { journalId: I1 };
		render(Page, { data: makeData() });
		const archive = [...document.querySelectorAll('[data-testid="journal-detail"] button')].find(
			(b) => text(b) === '보관'
		) as HTMLButtonElement;
		archive.click();
		flushSync();
		expect(fetchSpy).not.toHaveBeenCalled();
		(
			document.querySelector('[data-action="journal-archive-confirm"]') as HTMLButtonElement
		).click();
		await vi.waitFor(() => expect(nav.goto).toHaveBeenCalled());
		expect(fetchSpy.mock.calls[0][0]).toBe('/journal?/archive');
		const body = fetchSpy.mock.calls[0][1]!.body as FormData;
		expect(body.get('id')).toBe(I1);
		expect(body.get('table')).toBe('journal_entries');
		fetchSpy.mockRestore();
	});

	it('모바일 상세 위 보관 확인에서 Esc 한 번은 확인만 닫고, 두 번째는 상세를 닫는다 (L-2)', async () => {
		const back = vi.spyOn(history, 'back').mockImplementation(() => {});
		mq.pc = false;
		pageMock.state = { journalId: I1, journalFromList: true };
		render(Page, { data: makeData() });
		flushSync();
		const full = () => document.querySelector('.sheet.full.open');
		expect(full()).toBeTruthy();
		const archive = [...document.querySelectorAll('[data-testid="journal-detail"] button')].find(
			(b) => text(b) === '보관'
		) as HTMLButtonElement;
		archive.focus();
		archive.click();
		flushSync();
		const confirmOpen = () =>
			document.querySelector('.sheet.open [data-action="journal-archive-confirm"]');
		expect(confirmOpen()).toBeTruthy();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		);
		flushSync();
		expect(confirmOpen()).toBeFalsy();
		expect(full()).toBeTruthy();
		expect(back).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(archive);
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		);
		flushSync();
		// history.back 을 목으로 막아 두었으므로 page.state 는 그대로고 시트는 열린 채로 남는다.
		// 실제 닫힘은 기존 'Esc로 닫으면 history.back()' 테스트와 같이 back 호출로 확인한다.
		expect(full()).toBeTruthy();
		expect(back).toHaveBeenCalledTimes(1);
		back.mockRestore();
	});
});
