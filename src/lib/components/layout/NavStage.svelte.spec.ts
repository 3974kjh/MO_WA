import '../../../app.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';
import { createRawSnippet } from 'svelte';

const hoisted = vi.hoisted(() => ({ onData: null as null | (() => void), stops: 0 }));

vi.mock('$app/state', async () => ({
	navigating: (await import('./navStage.fixture.svelte')).navigating
}));
vi.mock('$app/navigation', async () => ({
	afterNavigate: (await import('./navStage.fixture.svelte')).afterNavigate
}));
vi.mock('$lib/nav/dataSignal', () => ({
	observeDataResponse: (_p: string, cb: () => void) => {
		hoisted.onData = cb;
		return () => {
			hoisted.stops++;
		};
	}
}));

import NavStage from './NavStage.svelte';
import { fakeNav } from './navStage.fixture.svelte';
import { FINISH_HOLD_MS, SHOW_DELAY_MS } from '$lib/nav/navProgress';

const content = createRawSnippet(() => ({
	render: () => '<p data-testid="page-body">현재 화면</p>'
}));
const tall = createRawSnippet(() => ({
	render: () =>
		'<div data-testid="page-body" style="height:3000px"><input data-testid="field" value="삼성" /></div>'
}));
const panel = () => document.querySelector<HTMLElement>('[data-testid="nav-loading"]');
const body = () => document.querySelector<HTMLElement>('[data-testid="page-body"]')!;
const bodyShown = () => getComputedStyle(body()).visibility === 'visible';
const bar = () => document.querySelector<HTMLElement>('[role="progressbar"]');
const now = () => parseInt(document.querySelector('.pct')?.textContent ?? 'NaN');
const step = () => document.querySelector('.step')?.textContent;
const advance = async (ms: number) => {
	await vi.advanceTimersByTimeAsync(ms);
	flushSync();
};

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
	hoisted.onData = null;
	hoisted.stops = 0;
	fakeNav.reset();
});
afterEach(() => {
	vi.useRealTimers();
});

const mount = () => render(NavStage, { children: content });
const mountTall = () => render(NavStage, { children: tall });
afterEach(() => scrollTo(0, 0));

describe('NavStage', () => {
	it('이동이 없으면 본문만 보인다', () => {
		mount();
		expect(panel()).toBeNull();
		expect(bodyShown()).toBe(true);
	});

	it('180ms 안에 끝나는 이동은 패널이 뜨지 않는다', async () => {
		mount();
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(SHOW_DELAY_MS - 40);
		expect(panel()).toBeNull();
		fakeNav.complete();
		await advance(10);
		expect(panel()).toBeNull();
		await advance(1000);
		expect(panel()).toBeNull();
		expect(bodyShown()).toBe(true);
	});

	it('느린 이동: 패널이 본문을 대신하고 라우트 문구·진행바가 보인다', async () => {
		mount();
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(SHOW_DELAY_MS + 80);
		expect(panel()).not.toBeNull();
		expect(bodyShown()).toBe(false); // 이전 화면은 가려진다(지우지 않음)
		expect(body().getBoundingClientRect().height).toBeGreaterThan(0); // 자리는 그대로(높이가 튀지 않음)
		expect(step()).toBe('보유 종목 불러오는 중');
		expect(Number(bar()!.getAttribute('aria-valuenow')) % 10).toBe(0); // 보조기술 값은 10% 단위
		expect(now()).toBeGreaterThan(4);
		expect(now()).toBeLessThan(100);
		expect(document.querySelector('.stage')!.getAttribute('aria-busy')).toBe('true');
		fakeNav.cancel();
		await advance(10);
	});

	it('서버 응답이 길어지면 둘째 문구, 응답을 받으면 "화면 구성 중"으로 바뀐다', async () => {
		mount();
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(1500);
		expect(step()).toBe('시세 기준 시각 확인 중');
		hoisted.onData!();
		await advance(50);
		expect(step()).toBe('화면 구성 중');
		expect(now()).toBeGreaterThanOrEqual(72);
		expect(now()).toBeLessThan(100);
		fakeNav.cancel();
		await advance(10);
	});

	it('완료하면 100%를 채우고 FINISH_HOLD 뒤 사라지며 본문이 다시 보인다', async () => {
		mount();
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(700);
		hoisted.onData!();
		await advance(100);
		fakeNav.complete();
		await advance(10);
		expect(now()).toBe(100);
		expect(step()).toBe('준비됐어요');
		expect(bodyShown()).toBe(false); // 패널이 사라질 때까지 본문은 가려 둔다
		await advance(FINISH_HOLD_MS + 20);
		expect(panel()).toBeNull();
		expect(document.querySelector('.stage')!.getAttribute('aria-busy')).toBe('false');
	});

	it('완료 연출 동안 카드와 본문이 한 프레임도 같이 보이지 않는다(카드가 첫 화면을 가리지 않음)', async () => {
		mount();
		fakeNav.start('/', '/portfolio', '/(app)/portfolio');
		await advance(900);
		hoisted.onData!();
		await advance(50);
		fakeNav.complete();
		let overlap = 0;
		let sawPanel = false;
		let sawBodyAfter = false;
		for (let t = 0; t <= FINISH_HOLD_MS + 40; t += 10) {
			flushSync();
			const p = panel();
			const panelOpaque = p !== null && parseFloat(getComputedStyle(p).opacity) > 0.01;
			if (p) sawPanel = true;
			if (panelOpaque && bodyShown()) overlap++;
			if (!p && bodyShown()) sawBodyAfter = true;
			await vi.advanceTimersByTimeAsync(10);
		}
		expect(sawPanel).toBe(true);
		expect(overlap).toBe(0);
		expect(sawBodyAfter).toBe(true);
		expect(panel()).toBeNull();
	});

	it('이동이 취소되면 100% 없이 바로 정리되고 이전 화면이 돌아온다', async () => {
		mount();
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(900);
		expect(panel()).not.toBeNull();
		fakeNav.cancel();
		await advance(10);
		expect(panel()).toBeNull();
		expect(bodyShown()).toBe(true);
		expect(hoisted.stops).toBeGreaterThan(0); // 응답 관측도 끊김
	});

	it('쿼리만 바뀌는 이동(필터·쪽)은 패널이 없다', async () => {
		mount();
		fakeNav.start('/stocks', '/stocks?f=hold', '/(app)/stocks');
		await advance(1500);
		expect(panel()).toBeNull();
		expect(hoisted.onData).toBeNull();
		fakeNav.complete();
	});

	it('연속 클릭: 목적지가 바뀌면 문구가 새 라우트로 바뀌고 패널은 그대로 유지된다', async () => {
		mount();
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(1000);
		expect(step()).toBe('시세 기준 시각 확인 중'); // 1단계
		fakeNav.start('/', '/portfolio', '/(app)/portfolio');
		await advance(20);
		expect(panel()).not.toBeNull();
		expect(step()).toBe('보유 종목 불러오는 중'); // 포트폴리오 0단계 문구(다시 처음 단계)
		expect(document.querySelector('.name')!.textContent).toBe('포트폴리오');
		expect(now()).toBeLessThan(20); // 처음부터 다시
		fakeNav.complete();
		await advance(FINISH_HOLD_MS + 20);
		expect(panel()).toBeNull();
	});

	it('모르는 라우트는 일반 문구', async () => {
		mount();
		fakeNav.start('/', '/mystery', '/(app)/mystery');
		await advance(400);
		expect(step()).toBe('화면 데이터 준비 중');
		fakeNav.cancel();
		await advance(10);
	});

	it('M1: 패널이 떠 있어도 문서 높이가 유지돼 복원 스크롤(뒤로/앞으로)이 잘리지 않는다', async () => {
		mountTall();
		const h = document.documentElement.scrollHeight;
		scrollTo(0, 500);
		fakeNav.start('/', '/stocks', '/(app)/stocks', 'popstate');
		await advance(900);
		expect(panel()).not.toBeNull();
		expect(document.documentElement.scrollHeight).toBe(h);
		scrollTo(0, 500); // SvelteKit이 복원할 때처럼 패널이 떠 있는 동안 스크롤
		expect(scrollY).toBe(500);
		fakeNav.complete();
		await advance(FINISH_HOLD_MS + 20);
		expect(panel()).toBeNull();
		expect(scrollY).toBe(500);
	});

	it('스크롤한 화면에서도 패널이 보인다(상단바 아래 sticky)', async () => {
		mountTall();
		scrollTo(0, 500);
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(900);
		const r = document.querySelector('.panel')!.getBoundingClientRect();
		expect(r.top).toBeGreaterThanOrEqual(0);
		expect(r.bottom).toBeLessThan(innerHeight);
		fakeNav.cancel();
		await advance(10);
	});

	it('L1: 취소하면 스크롤과 본문 입력값이 그대로이고 포커스는 원래 요소로 돌아온다', async () => {
		mountTall();
		const field = () => document.querySelector<HTMLInputElement>('[data-testid="field"]')!;
		field().focus();
		scrollTo(0, 400);
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(900);
		expect(panel()).not.toBeNull();
		expect(document.activeElement).not.toBe(field()); // 가려진 본문은 포커스를 못 갖는다
		expect(scrollY).toBe(400);
		fakeNav.cancel();
		await advance(10);
		await vi.advanceTimersByTimeAsync(0);
		expect(panel()).toBeNull();
		expect(scrollY).toBe(400);
		expect(field().value).toBe('삼성');
		expect(document.activeElement).toBe(field());
	});

	it('성공 완료 때는 포커스를 되돌리지 않는다', async () => {
		mountTall();
		const field = document.querySelector<HTMLInputElement>('[data-testid="field"]')!;
		field.focus();
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(900);
		fakeNav.complete();
		await advance(FINISH_HOLD_MS + 20);
		expect(document.activeElement).not.toBe(field);
	});

	it('가려진 이전 본문은 포커스·보조기술에서 빠진다(inert + visibility)', async () => {
		mountTall();
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(900);
		const content = document.querySelector<HTMLElement>('.content')!;
		expect(content.inert).toBe(true);
		const field = document.querySelector<HTMLInputElement>('[data-testid="field"]')!;
		field.focus();
		expect(document.activeElement).not.toBe(field);
		fakeNav.cancel();
		await advance(10);
		expect(content.inert).toBe(false);
	});

	it('L1: 패널이 뜬 뒤 현재 화면으로 돌아오는 이동(현재 메뉴 클릭)이 끝나면 스크롤·포커스가 원래 자리로 돌아온다', async () => {
		mountTall();
		const field = () => document.querySelector<HTMLInputElement>('[data-testid="field"]')!;
		field().focus();
		scrollTo(0, 400);
		fakeNav.start('/stocks', '/briefings', '/(app)/briefings');
		await advance(900);
		expect(panel()).not.toBeNull();
		// 현재 메뉴(/stocks)를 눌러 되돌아옴 — SvelteKit은 이 이동을 끝내며 맨 위로 올리고 포커스를 body로 보낸다
		fakeNav.start('/stocks', '/stocks', '/(app)/stocks');
		await advance(20);
		expect(panel()).toBeNull();
		scrollTo(0, 0);
		(document.activeElement as HTMLElement | null)?.blur();
		fakeNav.complete();
		await advance(20);
		await vi.advanceTimersByTimeAsync(0);
		expect(scrollY).toBe(400);
		expect(field().value).toBe('삼성');
		expect(document.activeElement).toBe(field());
	});

	it('L1: 방금 누른 메뉴 링크에 포커스가 있었다면 그 링크로 돌려놓는다', async () => {
		mountTall();
		const link = document.createElement('a');
		link.href = '#current';
		link.textContent = '현재 메뉴';
		document.body.append(link);
		try {
			scrollTo(0, 400);
			fakeNav.start('/stocks', '/briefings', '/(app)/briefings');
			await advance(900);
			link.focus({ preventScroll: true });
			fakeNav.start('/stocks', '/stocks', '/(app)/stocks');
			await advance(20);
			scrollTo(0, 0);
			link.blur();
			fakeNav.complete();
			await advance(20);
			await vi.advanceTimersByTimeAsync(0);
			expect(scrollY).toBe(400);
			expect(document.activeElement).toBe(link);
		} finally {
			link.remove();
		}
	});

	it('일반 링크 이동(패널 없던 이동)은 SvelteKit 기본대로 맨 위로 간다', async () => {
		mountTall();
		scrollTo(0, 400);
		fakeNav.start('/stocks', '/stocks', '/(app)/stocks');
		await advance(20);
		scrollTo(0, 0); // SvelteKit이 한 일
		fakeNav.complete();
		await advance(20);
		expect(scrollY).toBe(0);
	});
});
