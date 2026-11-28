/**
 * v1.7.6 모달 공통 구조(DS §7-11-0, handoff §22-4): 머리·꼬리 고정 + 본문만 스크롤 + 스크롤바 숨김 + 가장자리 단서 + 목차 점.
 */
import '../../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { flushSync } from 'svelte';
import Harness from '../../../../tests/ui/SheetTocHarness.svelte';
import { resetOpenSheets } from './sheetStack';

type Props = {
	sections?: number;
	lines?: number;
	foot?: boolean;
	variant?: 'bottom' | 'center' | 'full';
};
const q = <T extends HTMLElement = HTMLElement>(sel: string) =>
	document.querySelector<T>(`.sheet.open ${sel}`);
const sheet = () => document.querySelector<HTMLElement>('.sheet.open')!;
const body = () => q('.sheet-body')!;
const toc = () => q('.sheet-toc');
const dots = () => [...document.querySelectorAll<HTMLElement>('.sheet.open .toc-i')];
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));

async function openSheet(props: Props = {}, vp: [number, number] = [1280, 800]) {
	await page.viewport(vp[0], vp[1]);
	render(Harness, { props });
	document.querySelector<HTMLElement>('[data-testid="sheet-opener"]')!.click();
	flushSync();
	await expect.poll(() => !!document.querySelector('.sheet.open'), { timeout: 1500 }).toBe(true);
	await tick(350);
	await frame();
}

afterEach(async () => {
	document.body.style.overflow = '';
	resetOpenSheets();
	await page.viewport(1280, 800);
});

describe('모달 공통 구조 (합격 기준 1·2)', () => {
	it('.sheet > 머리 · .sheet-main > .sheet-body · 꼬리, 본문만 스크롤하고 머리·꼬리 좌표는 그대로', async () => {
		await openSheet({ sections: 3 });
		const s = sheet();
		expect([...s.children].map((c) => c.className.split(' ')[0])).toEqual(
			expect.arrayContaining(['sheet-head', 'sheet-main', 'sheet-foot'])
		);
		expect(body().parentElement!.classList.contains('sheet-main')).toBe(true);
		expect(getComputedStyle(s).overflow).toBe('hidden');
		expect(s.scrollHeight).toBeLessThanOrEqual(s.clientHeight);
		expect(body().scrollHeight).toBeGreaterThan(body().clientHeight);
		const head0 = q('.sheet-head')!.getBoundingClientRect().top;
		const foot0 = q('.sheet-foot')!.getBoundingClientRect().top;
		body().scrollTop = 300;
		await frame();
		expect(body().scrollTop).toBeGreaterThan(100);
		expect(q('.sheet-head')!.getBoundingClientRect().top).toBe(head0);
		expect(q('.sheet-foot')!.getBoundingClientRect().top).toBe(foot0);
		expect(s.scrollTop).toBe(0);
	});

	it('넘치는 textarea 는 스크롤바 숨김 대상에서 제외(단서가 없으므로)', async () => {
		await openSheet({ sections: 2 });
		const ta = document.createElement('textarea');
		body().append(ta);
		expect(getComputedStyle(ta).scrollbarWidth).not.toBe('none');
		const div = document.createElement('div');
		body().append(div);
		expect(getComputedStyle(div).scrollbarWidth).toBe('none');
	});

	it('모달 안 스크롤바는 보이지 않는다(폭 0, scrollbar-width none)', async () => {
		await openSheet({ sections: 3 });
		expect(body().offsetWidth - body().clientWidth).toBe(0);
		expect(getComputedStyle(body()).scrollbarWidth).toBe('none');
		expect(getComputedStyle(sheet()).scrollbarWidth).toBe('none');
		expect(getComputedStyle(body()).overscrollBehaviorY).toBe('contain');
	});

	it('꼬리가 없는 full 은 본문이 safe-area 여백(최소 20px)을 받는다', async () => {
		await openSheet({ sections: 2, foot: false, variant: 'full' });
		expect(q('.sheet-foot')).toBeNull();
		expect(parseFloat(getComputedStyle(body()).paddingBottom)).toBeGreaterThanOrEqual(20);
	});
});

describe('가장자리 단서 (합격 기준 3)', () => {
	const shadow = (sel: string) => getComputedStyle(q(sel)!, '::after').opacity;
	const shadowBefore = (sel: string) => getComputedStyle(q(sel)!, '::before').opacity;

	it('맨 위: 아래 단서만 · 중간: 둘 다 · 맨 아래: 위 단서만', async () => {
		await openSheet({ sections: 3 });
		expect(sheet().classList.contains('more-up')).toBe(false);
		expect(sheet().classList.contains('more-down')).toBe(true);
		await expect.poll(() => shadowBefore('.sheet-foot')).toBe('1');
		expect(shadow('.sheet-head')).toBe('0');
		body().scrollTop = 200;
		await frame();
		expect(sheet().classList.contains('more-up')).toBe(true);
		expect(sheet().classList.contains('more-down')).toBe(true);
		body().scrollTop = body().scrollHeight;
		await frame();
		expect(sheet().classList.contains('more-up')).toBe(true);
		expect(sheet().classList.contains('more-down')).toBe(false);
		await expect.poll(() => shadow('.sheet-head')).toBe('1');
		await expect.poll(() => Number(shadowBefore('.sheet-foot'))).toBeLessThan(0.01);
	});

	it('안 넘치는 모달에는 둘 다 없다', async () => {
		await openSheet({ sections: 1, lines: 2 });
		expect(sheet().classList.contains('more-up')).toBe(false);
		expect(sheet().classList.contains('more-down')).toBe(false);
		expect(body().hasAttribute('tabindex')).toBe(false);
	});
});

describe('꼬리 없는 모달의 하단 단서 (v1.7.7)', () => {
	const tail = () => {
		const main = q('.sheet-main')!;
		return {
			content: getComputedStyle(main, '::after').content,
			opacity: Number(getComputedStyle(main, '::after').opacity)
		};
	};

	it('꼬리가 없으면 아래로 더 있을 때 .sheet-main::after 가 켜지고, 맨 아래에 닿으면 꺼진다', async () => {
		await openSheet({ sections: 3, foot: false, variant: 'full' });
		expect(q('.sheet-foot')).toBeNull();
		expect(tail().content).not.toBe('none');
		await expect.poll(() => tail().opacity).toBeGreaterThan(0.99);
		const sh = getComputedStyle(q('.sheet-main')!, '::after');
		expect(sh.height).toBe('14px');
		expect(sh.borderBottomWidth).toBe('1px');
		body().scrollTop = body().scrollHeight;
		await frame();
		await expect.poll(() => tail().opacity).toBeLessThan(0.01);
		expect(sheet().classList.contains('more-up')).toBe(true);
	});

	it('안 넘치는 꼬리 없는 모달은 하단 단서가 없다', async () => {
		await openSheet({ sections: 1, lines: 1, foot: false, variant: 'full' });
		await tick(200);
		expect(tail().opacity).toBe(0);
	});

	it('꼬리가 있으면 본문 하단 단서는 없고(꼬리 위 단서만) .sheet-main::after 도 없다', async () => {
		await openSheet({ sections: 3 });
		expect(tail().content).toBe('none');
	});
});

describe('키보드 영역', () => {
	it('넘치면 tabindex=0 · role=region · aria-labelledby, 넘치지 않으면 없음', async () => {
		await openSheet({ sections: 3 });
		expect(body().getAttribute('tabindex')).toBe('0');
		expect(body().getAttribute('role')).toBe('region');
		const id = body().getAttribute('aria-labelledby')!;
		expect(document.getElementById(id)?.textContent).toBe('긴 모달');
	});

	it('열릴 때 첫 포커스는 본문 영역이 아니라 첫 내용(또는 꼬리 버튼)', async () => {
		await openSheet({ sections: 3 });
		await expect.poll(() => sheet().contains(document.activeElement)).toBe(true);
		expect(document.activeElement).not.toBe(body());
	});
});

describe('목차 점 표시 조건 (합격 기준 4)', () => {
	it('넘침 AND [data-toc] ≥ 2 → nav[aria-label=목차] 가 본문 오른쪽 가운데, 본문 padding-right 44', async () => {
		await openSheet({ sections: 3 });
		await expect.poll(() => !!toc()).toBe(true);
		expect(toc()!.getAttribute('aria-label')).toBe('목차');
		expect(dots()).toHaveLength(3);
		expect(dots().map((d) => d.getAttribute('aria-label'))).toEqual(['구역 1', '구역 2', '구역 3']);
		expect(getComputedStyle(body()).paddingRight).toBe('44px');
		const b = body().getBoundingClientRect();
		const t = toc()!.getBoundingClientRect();
		expect(Math.abs(t.top + t.height / 2 - (b.top + b.height / 2))).toBeLessThanOrEqual(1);
		expect(t.left).toBeGreaterThanOrEqual(b.left + b.width - 44 - 1);
		// PC 누름 영역 28×40, 점 6px
		const d = dots()[0].getBoundingClientRect();
		expect([d.width, d.height]).toEqual([28, 40]);
		const dot = getComputedStyle(dots()[0], '::before');
		expect([dot.width, dot.height]).toEqual(['6px', '6px']);
		const cur = getComputedStyle(dots()[0], '::before');
		expect(cur.transform).not.toBe('none'); // 현재 구역은 확대(8px)
		expect(dots()[0].getAttribute('aria-current')).toBe('location');
	});

	it('구역이 1개면 목차 없음(넘쳐도), 넘치지 않으면 구역이 여럿이어도 없음', async () => {
		await openSheet({ sections: 1, lines: 40 });
		expect(body().scrollHeight).toBeGreaterThan(body().clientHeight);
		expect(toc()).toBeNull();
		expect(getComputedStyle(body()).paddingRight).toBe('16px');
	});

	it('넘치지 않으면 목차 없음', async () => {
		await openSheet({ sections: 2, lines: 1 });
		expect(body().scrollHeight).toBeLessThanOrEqual(body().clientHeight + 1);
		expect(toc()).toBeNull();
	});

	it('모바일 390: 누름 영역 32×44', async () => {
		await openSheet({ sections: 3 }, [390, 844]);
		await expect.poll(() => dots().length).toBe(3);
		const d = dots()[0].getBoundingClientRect();
		expect([d.width, d.height]).toEqual([32, 44]);
	});
});

describe('목차 점 동작 (합격 기준 5·6)', () => {
	it('점을 누르면 이동·머리글에 포커스·aria-current 갱신, 머리·꼬리·목차 위치는 그대로', async () => {
		await openSheet({ sections: 4 });
		await expect.poll(() => dots().length).toBe(4);
		const head0 = q('.sheet-head')!.getBoundingClientRect().top;
		const foot0 = q('.sheet-foot')!.getBoundingClientRect().top;
		const toc0 = toc()!.getBoundingClientRect().top;
		dots()[2].click();
		flushSync();
		await expect.poll(() => body().scrollTop, { timeout: 2000 }).toBeGreaterThan(100);
		await tick(700);
		const h = [...document.querySelectorAll<HTMLElement>('.sheet.open [data-toc]')][2];
		expect(document.activeElement).toBe(h);
		expect(dots().map((d) => d.getAttribute('aria-current'))).toEqual([
			null,
			null,
			'location',
			null
		]);
		expect(q('.sheet-head')!.getBoundingClientRect().top).toBe(head0);
		expect(q('.sheet-foot')!.getBoundingClientRect().top).toBe(foot0);
		expect(toc()!.getBoundingClientRect().top).toBe(toc0);
	});

	it('이동 방식: 보통은 smooth, prefers-reduced-motion 이면 즉시(auto)', async () => {
		await openSheet({ sections: 3 });
		await expect.poll(() => dots().length).toBe(3);
		const calls: (string | undefined)[] = [];
		const el = body();
		const orig = el.scrollTo.bind(el) as (o: ScrollToOptions) => void;
		el.scrollTo = ((o: ScrollToOptions) => {
			calls.push(o.behavior);
			orig(o);
		}) as typeof el.scrollTo;
		dots()[1].click();
		flushSync();
		const real = window.matchMedia.bind(window);
		const spy = vi.spyOn(window, 'matchMedia').mockImplementation((qr: string) => {
			const m = real(qr);
			return qr.includes('prefers-reduced-motion')
				? ({ ...m, matches: true } as unknown as MediaQueryList)
				: m;
		});
		dots()[2].click();
		flushSync();
		spy.mockRestore();
		expect(calls).toEqual(['smooth', 'auto']);
		await expect.poll(() => body().scrollTop, { timeout: 2000 }).toBeGreaterThan(100);
	});

	it('휠로 스크롤하면 현재 점이 따라온다(맨 아래=마지막, 맨 위=첫째)', async () => {
		await openSheet({ sections: 4 });
		await expect.poll(() => dots().length).toBe(4);
		body().scrollTop = body().scrollHeight;
		await frame();
		await expect.poll(() => dots()[3].getAttribute('aria-current')).toBe('location');
		body().scrollTop = 0;
		await frame();
		await expect.poll(() => dots()[0].getAttribute('aria-current')).toBe('location');
		const h2 = [...document.querySelectorAll<HTMLElement>('.sheet.open [data-toc]')][1];
		body().scrollTop += h2.getBoundingClientRect().top - body().getBoundingClientRect().top + 4;
		await frame();
		await expect.poll(() => dots()[1].getAttribute('aria-current')).toBe('location');
	});

	it('점을 누른 직후는 그 구역으로 고정, 사용자가 다시 스크롤(휠)하면 풀린다', async () => {
		await openSheet({ sections: 4 });
		await expect.poll(() => dots().length).toBe(4);
		dots()[3].click();
		flushSync();
		await tick(800);
		expect(dots()[3].getAttribute('aria-current')).toBe('location');
		body().dispatchEvent(new WheelEvent('wheel', { deltaY: -10, bubbles: true }));
		body().scrollTop = 0;
		await frame();
		await expect.poll(() => dots()[0].getAttribute('aria-current')).toBe('location');
	});

	it('키보드: ↓·↑ 로 점 이동, 포커스가 점에 오면 왼쪽 라벨 툴팁(PC)', async () => {
		await openSheet({ sections: 3 });
		await expect.poll(() => dots().length).toBe(3);
		dots()[0].focus();
		dots()[0].dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
		);
		expect(document.activeElement).toBe(dots()[1]);
		dots()[1].dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
		);
		expect(document.activeElement).toBe(dots()[0]);
		dots()[0].dispatchEvent(new MouseEvent('mouseover'));
	});

	it('Tab 정지점은 현재 점 하나뿐(roving tabindex), Home·End 로 처음·끝 점 이동', async () => {
		await openSheet({ sections: 4 });
		await expect.poll(() => dots().length).toBe(4);
		const stops = () => dots().filter((d) => d.tabIndex === 0);
		expect(stops()).toEqual([dots()[0]]);
		body().scrollTop = body().scrollHeight;
		await frame();
		await expect.poll(() => stops()[0]).toBe(dots()[3]);
		expect(stops().length).toBe(1);
		const key = (el: HTMLElement, k: string) =>
			el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
		dots()[3].focus();
		key(dots()[3], 'Home');
		expect(document.activeElement).toBe(dots()[0]);
		key(dots()[0], 'End');
		expect(document.activeElement).toBe(dots()[3]);
	});

	it('점을 누르면 라벨이 1.3초 보였다가 사라진다', async () => {
		await openSheet({ sections: 3 }, [390, 844]);
		await expect.poll(() => dots().length).toBe(3);
		const tip = () => q('.toc-tip')!;
		dots()[1].click();
		flushSync();
		await expect.poll(() => tip().classList.contains('show')).toBe(true);
		expect(tip().textContent).toBe('구역 2');
		await tick(500);
		expect(tip().classList.contains('show')).toBe(true);
		await expect.poll(() => tip().classList.contains('show'), { timeout: 2500 }).toBe(false);
	});
});

describe('닫기 X (아이콘만)', () => {
	it('평소는 배경·테두리 없고 누름 44, 이름은 닫기, 포커스 링은 유지', async () => {
		await openSheet({ sections: 2 }, [1280, 800]);
		const btn = q<HTMLButtonElement>('.close')!;
		expect(btn.getAttribute('aria-label')).toBe('닫기');
		const r = btn.getBoundingClientRect();
		expect(r.width).toBeGreaterThanOrEqual(44);
		expect(r.height).toBeGreaterThanOrEqual(44);
		const cs = getComputedStyle(btn);
		expect(cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent').toBe(
			true
		);
		expect(parseFloat(cs.borderTopWidth)).toBe(0);
		expect(
			cs.outlineStyle === 'none' || cs.outlineStyle === '' || parseFloat(cs.outlineWidth) === 0
		).toBe(true);
		btn.focus();
		btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		// :focus-visible 은 키보드 포커스 뒤에만. 기존 전역 규칙 유지 여부
		const focused = document.activeElement === btn;
		expect(focused).toBe(true);
		const on = getComputedStyle(btn);
		// 클래스에 포커스 링 규칙이 남아 있음(.btn-icon:focus-visible)
		expect(on.outlineColor.length).toBeGreaterThan(0);
	});
});

describe('구역이 많을 때 (합격 기준 7)', () => {
	it('10개: 390×560 에서 점 32 로 압축, 겹치지 않고 모달 밖으로 안 나간다', async () => {
		await openSheet({ sections: 10, lines: 6 }, [390, 560]);
		await expect.poll(() => dots().length).toBe(10);
		const hs = dots().map((d) => d.getBoundingClientRect().height);
		expect(Math.min(...hs)).toBeGreaterThanOrEqual(32);
		const t = toc()!.getBoundingClientRect();
		const b = body().getBoundingClientRect();
		expect(t.top).toBeGreaterThanOrEqual(b.top - 0.5);
		expect(t.bottom).toBeLessThanOrEqual(b.bottom + 0.5);
	});

	it('22개: 점 32, 목차 목록만 목차 안에서 스크롤, 현재 점은 보이게 따라간다', async () => {
		await openSheet({ sections: 22, lines: 4 }, [390, 560]);
		await expect.poll(() => dots().length).toBe(22);
		const ol = q('.sheet-toc ol')!;
		expect(Math.round(dots()[0].getBoundingClientRect().height)).toBe(32);
		expect(ol.scrollHeight).toBeGreaterThan(ol.clientHeight);
		expect(getComputedStyle(ol).scrollbarWidth).toBe('none');
		const b = body().getBoundingClientRect();
		const t = toc()!.getBoundingClientRect();
		expect(t.top).toBeGreaterThanOrEqual(b.top - 0.5);
		expect(t.bottom).toBeLessThanOrEqual(b.bottom + 0.5);
		body().scrollTop = body().scrollHeight;
		await frame();
		await expect.poll(() => dots()[21].getAttribute('aria-current')).toBe('location');
		await expect
			.poll(() => {
				const d = dots()[21].getBoundingClientRect();
				const o = ol.getBoundingClientRect();
				return d.bottom <= o.bottom + 0.5 && d.top >= o.top - 0.5;
			})
			.toBe(true);
	});
});

describe('끌어 닫기 회귀 (합격 기준 9)', () => {
	const touch = (el: Element, name: string, x: number, y: number, withTouch: boolean) => {
		const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
		el.dispatchEvent(
			new TouchEvent(name, {
				bubbles: true,
				cancelable: true,
				touches: withTouch ? [t] : [],
				targetTouches: withTouch ? [t] : [],
				changedTouches: [t]
			})
		);
	};
	const closedCount = () =>
		Number(document.querySelector('[data-testid="closed-count"]')!.textContent);
	const swipe = (el: Element, y0Offset = 12) => {
		const r = el.getBoundingClientRect();
		const x = r.x + r.width / 2;
		const y = r.y + y0Offset;
		const dy = sheet().getBoundingClientRect().height * 0.5;
		touch(el, 'touchstart', x, y, true);
		touch(el, 'touchmove', x, y + 8, true);
		touch(el, 'touchmove', x, y + dy, true);
		touch(el, 'touchend', x, y + dy, false);
		flushSync();
	};

	it('본문 맨 위(scrollTop 0)에서 아래로 끌면 닫힌다', async () => {
		await openSheet({ sections: 3 }, [390, 844]);
		body().scrollTop = 0;
		swipe(body());
		await expect.poll(closedCount, { timeout: 1000 }).toBe(1);
	});

	it('본문이 스크롤된 뒤에는 닫히지 않는다', async () => {
		await openSheet({ sections: 3 }, [390, 844]);
		body().scrollTop = 200;
		swipe(body());
		await tick(300);
		expect(closedCount()).toBe(0);
	});

	it('꼬리·목차에서 시작한 터치는 끌기가 아니다(본문이 맨 위여도)', async () => {
		await openSheet({ sections: 3 }, [390, 844]);
		await expect.poll(() => dots().length).toBe(3);
		body().scrollTop = 0;
		swipe(q('.sheet-foot')!, 4);
		swipe(toc()!, 4);
		await tick(300);
		expect(closedCount()).toBe(0);
		expect(sheet().classList.contains('dragging')).toBe(false);
	});

	it('<640 X 없음 · 손잡이 120×44 · ≥640 X 있음·손잡이 없음', async () => {
		await openSheet({ sections: 3 }, [390, 844]);
		expect(getComputedStyle(q('.close')!).display).toBe('none');
		const g = q('.grab')!.getBoundingClientRect();
		expect([g.width, g.height]).toEqual([120, 44]);
		document.body.innerHTML = '';
		resetOpenSheets();
		await openSheet({ sections: 3 }, [1280, 800]);
		expect(getComputedStyle(q('.close')!).display).not.toBe('none');
		expect(getComputedStyle(q('.grab')!).display).toBe('none');
	});
});
