import '../../../app.css';
import { describe, expect, it } from 'vitest';
import { cdp } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';
import NavLoading from './NavLoading.svelte';

const bar = () => document.querySelector<HTMLElement>('[role="progressbar"]')!;

describe('NavLoading 렌더·접근성', () => {
	it('문구는 바 위(DOM·화면 모두), 퍼센트가 함께 보인다', () => {
		render(NavLoading, { name: '종목', step: '보유 종목 불러오는 중', percent: 42 });
		const step = document.querySelector('.step')!;
		expect(step.textContent).toBe('보유 종목 불러오는 중');
		expect(document.body.textContent).toContain('42%');
		expect(step.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			bar().getBoundingClientRect().top
		);
		expect(step.compareDocumentPosition(bar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('role=progressbar + aria-valuenow/min/max/valuetext, 문구 영역은 aria-live', () => {
		render(NavLoading, { name: '종목', step: '시세 기준 시각 확인 중', percent: 63 });
		expect(bar().getAttribute('aria-valuemin')).toBe('0');
		expect(bar().getAttribute('aria-valuemax')).toBe('100');
		// 보조기술 값은 10% 단위로 줄여 이동 한 번에 수십 번 읽히지 않게 한다(화면 숫자는 정확한 값)
		expect(bar().getAttribute('aria-valuenow')).toBe('60');
		expect(bar().getAttribute('aria-valuetext')).toBe('종목 화면 준비 60%');
		expect(document.querySelector('.pct')!.textContent).toBe('63%');
		expect(bar().getAttribute('aria-label')).toBe('종목 화면 준비');
		const live = document.querySelector('[aria-live]')!;
		expect(live.getAttribute('aria-live')).toBe('polite');
		expect(live.textContent).toBe('시세 기준 시각 확인 중');
	});

	it('aria-valuenow 변화는 이동 한 번에 10번 이하(10% 단위, 100은 완료 때만)', async () => {
		const seen = new Set<string>();
		const { rerender } = render(NavLoading, { name: '홈', step: 's', percent: 4 });
		for (let p = 4; p < 100; p++) {
			rerender({ name: '홈', step: 's', percent: p });
			flushSync();
			seen.add(bar().getAttribute('aria-valuenow')!);
		}
		expect(seen.has('100')).toBe(false);
		expect(seen.size).toBeLessThanOrEqual(10);
		rerender({ name: '홈', step: 's', percent: 100, done: true });
		flushSync();
		expect(bar().getAttribute('aria-valuenow')).toBe('100');
	});

	it('게이지는 transform으로 채운다(너비·레이아웃 속성이 아님)', () => {
		render(NavLoading, { name: '홈', step: 's', percent: 40 });
		const fill = document.querySelector<HTMLElement>('.fill')!;
		expect(fill.style.transform).toBe('translateX(-60%)');
		expect(fill.style.width).toBe('');
		expect(getComputedStyle(fill).transitionProperty).toBe('transform');
		expect(getComputedStyle(fill).transitionDuration).not.toBe('0s');
	});

	it('완료(100%): 막대와 숫자가 같은 프레임에 100% — 이전 값에서 따라오지 않는다', () => {
		const { rerender } = render(NavLoading, { name: '홈', step: 's', percent: 72 });
		const fill = document.querySelector<HTMLElement>('.fill')!;
		const track = document.querySelector<HTMLElement>('.track')!;
		expect(fill.getBoundingClientRect().right).toBeLessThan(
			track.getBoundingClientRect().right - 1
		);
		rerender({ name: '홈', step: 's', percent: 100, done: true });
		flushSync();
		// 같은 프레임(대기 없음)에 막대가 가득 차고, 숫자도 100%
		expect(getComputedStyle(fill).transitionDuration).toBe('0s');
		expect(fill.getBoundingClientRect().right).toBeCloseTo(track.getBoundingClientRect().right, 0);
		expect(document.querySelector('.pct')!.textContent).toBe('100%');
		expect(bar().getAttribute('aria-valuenow')).toBe('100');
	});

	it('퍼센트 숫자는 16px·700·accent·tabular-nums', () => {
		render(NavLoading, { name: '홈', step: 's', percent: 42 });
		const pct = document.querySelector<HTMLElement>('.pct')!;
		const c = getComputedStyle(pct);
		expect(c.fontSize).toBe('16px');
		expect(c.fontWeight).toBe('700');
		expect(c.fontVariantNumeric).toContain('tabular-nums');
		const probe = document.createElement('i');
		probe.style.color = 'var(--color-accent)';
		document.body.append(probe);
		expect(c.color).toBe(getComputedStyle(probe).color);
		probe.remove();
	});

	it('0%는 게이지가 비고, 100%는 가득 찬다', () => {
		const { rerender } = render(NavLoading, { name: '홈', step: 's', percent: 0 });
		const fill = () => document.querySelector<HTMLElement>('.fill')!;
		expect(fill().style.transform).toBe('translateX(-100%)');
		rerender({ name: '홈', step: 's', percent: 100, done: true });
		return expect.poll(() => fill().style.transform).toBe('translateX(0%)');
	});

	it('prefers-reduced-motion: 게이지 이동·광택 애니메이션이 꺼진다', async () => {
		render(NavLoading, { name: '홈', step: 's', percent: 50 });
		const fill = document.querySelector<HTMLElement>('.fill')!;
		// 기본: 광택(::after)은 움직이고 이동은 전환 시간이 있다
		expect(getComputedStyle(fill, '::after').display).toBe('block');
		const session = cdp();
		await session.send('Emulation.setEmulatedMedia', {
			features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
		});
		try {
			expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
			expect(parseFloat(getComputedStyle(fill).transitionDuration)).toBeLessThan(0.001);
			expect(getComputedStyle(fill, '::after').display).toBe('none'); // 무한 광택 숨김
			expect(
				parseFloat(
					getComputedStyle(document.querySelector('[data-testid="nav-loading"]')!).animationDuration
				)
			).toBeLessThan(0.001); // 나타남 애니메이션은 전역 규칙으로 즉시
		} finally {
			await session.send('Emulation.setEmulatedMedia', { features: [] });
		}
	});

	it('메뉴 이름(.name)은 13px·500·muted — 디자이너 v1.8이 참조하는 클래스', () => {
		render(NavLoading, { name: '종목', step: 's', percent: 5 });
		const n = getComputedStyle(document.querySelector('.name')!);
		expect(n.fontSize).toBe('13px');
		expect(n.fontWeight).toBe('500');
		const probe = document.createElement('i');
		probe.style.color = 'var(--color-muted)';
		document.body.append(probe);
		expect(n.color).toBe(getComputedStyle(probe).color);
		probe.remove();
	});

	it('완료 연출은 나타남과 다른 애니메이션(이미 끝난 애니메이션을 되감지 않는다)', () => {
		render(NavLoading, { name: '홈', step: 's', percent: 100, done: true });
		const w = getComputedStyle(document.querySelector('[data-testid="nav-loading"]')!);
		expect(w.animationName).toContain('nl-out');
	});

	it('색은 토큰만 쓴다(하드코딩 색·dark: 클래스 없음)', () => {
		render(NavLoading, { name: '홈', step: 's', percent: 50 });
		const fill = document.querySelector<HTMLElement>('.fill')!;
		const accent = getComputedStyle(document.documentElement)
			.getPropertyValue('--color-accent')
			.trim();
		expect(accent).not.toBe('');
		const probe = document.createElement('i');
		probe.style.color = accent;
		document.body.append(probe);
		expect(getComputedStyle(fill).backgroundColor).toBe(getComputedStyle(probe).color);
		probe.remove();
		expect(document.querySelector('[class*="dark:"]')).toBeNull();
	});
});
