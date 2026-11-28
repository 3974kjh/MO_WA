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
const panel = () => document.querySelector<HTMLElement>('[data-testid="nav-loading"]');
const body = () => document.querySelector<HTMLElement>('[data-testid="page-body"]')!;
const bar = () => document.querySelector<HTMLElement>('[role="progressbar"]');
const now = () => Number(bar()?.getAttribute('aria-valuenow'));
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

describe('NavStage', () => {
	it('이동이 없으면 본문만 보인다', () => {
		mount();
		expect(panel()).toBeNull();
		expect(body().offsetParent).not.toBeNull();
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
		expect(body().offsetParent).not.toBeNull();
	});

	it('느린 이동: 패널이 본문을 대신하고 라우트 문구·진행바가 보인다', async () => {
		mount();
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(SHOW_DELAY_MS + 80);
		expect(panel()).not.toBeNull();
		expect(body().offsetParent).toBeNull(); // 이전 화면은 가려진다(지우지 않음)
		expect(step()).toBe('보유 종목 불러오는 중');
		expect(bar()!.getAttribute('aria-valuenow')).toBe(String(now()));
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
		expect(body().offsetParent).not.toBeNull(); // 새 화면은 바로 보이고, 패널은 위에서 사라진다
		await advance(FINISH_HOLD_MS + 20);
		expect(panel()).toBeNull();
		expect(document.querySelector('.stage')!.getAttribute('aria-busy')).toBe('false');
	});

	it('이동이 취소되면 100% 없이 바로 정리되고 이전 화면이 돌아온다', async () => {
		mount();
		fakeNav.start('/', '/stocks', '/(app)/stocks');
		await advance(900);
		expect(panel()).not.toBeNull();
		fakeNav.cancel();
		await advance(10);
		expect(panel()).toBeNull();
		expect(body().offsetParent).not.toBeNull();
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
});
