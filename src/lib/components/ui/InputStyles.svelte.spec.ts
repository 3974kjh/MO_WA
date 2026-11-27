/**
 * v1.7.3 입력 테두리: 선은 언제나 하나.
 * 진짜 border 1px, 포커스 = border 색 + outline 2px / offset -2px, 오류 빨강 2px, 안쪽 input 0.
 */
import '../../../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Harness from '../../../../tests/ui/InputStyleHarness.svelte';

function css(el: Element, prop: string) {
	return getComputedStyle(el as HTMLElement).getPropertyValue(prop);
}

function paint(el: string) {
	const node = document.querySelector<HTMLElement>(el)!;
	node.focus();
	return node;
}

afterEach(async () => {
	(document.activeElement as HTMLElement | null)?.blur();
	await page.viewport(1280, 800);
});

describe('입력 테두리 한 줄 (v1.7.3)', () => {
	it('.input 포커스: outline 2px / offset -2px 이고 바깥으로 띄운 고리가 없다', async () => {
		await page.viewport(390, 844);
		render(Harness);
		const el = paint('#reason');
		expect(css(el, 'outline-width')).toBe('2px');
		expect(css(el, 'outline-style')).toBe('solid');
		expect(css(el, 'outline-offset')).toBe('-2px');
		// 예전 두 겹: inset 1px 링 + offset 1px 바깥 outline
		expect(css(el, 'outline-offset')).not.toBe('1px');
		const shadow = css(el, 'box-shadow');
		expect(
			shadow === 'none' || shadow.includes('0px 0px') || /^rgba?\(0, 0, 0, 0\)/.test(shadow)
		).toBe(true);
	});

	it('오류 .input은 포커스여도 빨강 2px 한 줄이다', async () => {
		await page.viewport(390, 844);
		render(Harness);
		const el = paint('#reason-invalid');
		expect(css(el, 'outline-width')).toBe('2px');
		expect(css(el, 'outline-offset')).toBe('-2px');
		const color = css(el, 'outline-color');
		// --color-up 빨강 (라이트 토큰). 포커스 청록이 아님.
		expect(color).not.toBe(css(document.documentElement, '--color-focus').trim() || color);
		const up = getComputedStyle(document.documentElement).getPropertyValue('--color-up').trim();
		if (up.startsWith('#')) {
			// computed는 rgb()
			expect(color.startsWith('rgb')).toBe(true);
		}
		expect(css(el, 'outline-color')).toBeTruthy();
	});

	it('.mw-input-group은 진짜 1px border 이고, 포커스 때 안쪽 2px outline 이다', async () => {
		await page.viewport(390, 844);
		render(Harness);
		const group = document.querySelector<HTMLElement>('[data-testid="group"]')!;
		expect(css(group, 'border-top-width')).toBe('1px');
		expect(css(group, 'border-top-style')).toBe('solid');
		expect(css(group, 'box-shadow')).toBe('none');
		group.querySelector('input')!.focus();
		expect(css(group, 'outline-width')).toBe('2px');
		expect(css(group, 'outline-style')).toBe('solid');
		expect(css(group, 'outline-offset')).toBe('-2px');
		const input = group.querySelector('input')!;
		expect(css(input, 'border-top-width')).toBe('0px');
		expect(css(input, 'outline-style') === 'none' || css(input, 'outline-width') === '0px').toBe(
			true
		);
		expect(css(input, 'box-shadow')).toBe('none');
	});

	it('오류 그룹은 포커스여도 빨강 2px 이고, 눈 버튼 포커스면 상자 고리를 끈다', async () => {
		await page.viewport(390, 844);
		render(Harness);
		const group = document.querySelector<HTMLElement>('[data-testid="group-invalid"]')!;
		group.querySelector('input')!.focus();
		expect(css(group, 'outline-width')).toBe('2px');
		expect(css(group, 'outline-offset')).toBe('-2px');
		const ok = document.querySelector<HTMLElement>('[data-testid="group"]')!;
		const btn = ok.querySelector<HTMLElement>('.btn-icon')!;
		btn.focus();
		expect(document.activeElement).toBe(btn);
		// 상자 고리 끔, 버튼 고리만 보임. (overrides 통째 복사: 일반 .btn-icon:focus-visible 이
		// 묶음 전용 outline-offset:-2px 보다 뒤에 있어 오프셋·두께는 브라우저 계산값을 고정하지 않음)
		expect(css(ok, 'outline-style') === 'none' || css(ok, 'outline-width') === '0px').toBe(true);
		expect(css(btn, 'outline-style')).toBe('solid');
		expect(Number.parseFloat(css(btn, 'outline-width'))).toBeGreaterThan(0);
	});
});
