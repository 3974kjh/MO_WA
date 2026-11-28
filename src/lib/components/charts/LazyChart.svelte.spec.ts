/**
 * 지연 차트 청크 실패 (code_review H1/M1): 같은 칸 안에서 '불러오지 못했어요' + 새로고침, 높이 변화 없음.
 */
import '../../../app.css';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Harness from '../../../../tests/ui/LazyChartHarness.svelte';
import PendingWidth from '../../../../tests/ui/PendingWidthHarness.svelte';

const chunkErr = () => new TypeError('Failed to fetch dynamically imported module: x');
const slot = (root: HTMLElement) => root.querySelector<HTMLElement>('.chart-pending');
const Ok = () => ({ default: (() => {}) as never });

describe('LazyChart 실패 상태', () => {
	it('로더가 거절하면 같은 칸에서 안내와 새로고침 버튼이 나오고 aria-busy는 풀린다', async () => {
		let fail!: (e: unknown) => void;
		const load = () => new Promise<never>((_, rej) => (fail = rej));
		const onretry = vi.fn();
		const { container } = render(Harness, { load, onretry });
		const root = container as HTMLElement;
		const pending = slot(root)!;
		expect(pending.getAttribute('aria-busy')).toBe('true');
		const before = pending.getBoundingClientRect();
		fail(chunkErr());
		await expect.poll(() => root.querySelector('.fail-msg')).not.toBeNull();
		expect(root.querySelector('.fail-msg')?.textContent).toBe('불러오지 못했어요');
		expect(root.querySelector('.fail-msg')?.getAttribute('role')).toBe('alert');
		expect(root.querySelector('[aria-busy]')).toBeNull();
		const btn = root.querySelector<HTMLButtonElement>('.chart-pending button')!;
		expect(btn.textContent?.trim()).toBe('새로고침');
		const after = slot(root)!.getBoundingClientRect();
		expect(Math.round(after.height)).toBe(Math.round(before.height)); // 밀림 0
		expect(Math.round(after.top)).toBe(Math.round(before.top));
		btn.click();
		expect(onretry).toHaveBeenCalledTimes(1);
	});

	it('도넛: 실패해도 범례는 그대로 있고 180 칸 안에서 안내가 나온다', async () => {
		let fail!: (e: unknown) => void;
		const load = () => new Promise<never>((_, rej) => (fail = rej));
		const { container } = render(Harness, { load, kind: 'donut' });
		const root = container as HTMLElement;
		const before = root.querySelector<HTMLElement>('.donut-shell')!.getBoundingClientRect();
		fail(chunkErr());
		await expect.poll(() => root.querySelector('.fail-msg')).not.toBeNull();
		const after = root.querySelector<HTMLElement>('.donut-shell')!.getBoundingClientRect();
		expect(Math.round(after.height)).toBe(Math.round(before.height));
		expect(root.querySelectorAll('.leg-table tbody tr').length).toBe(2);
		expect(root.querySelector('.donut')?.querySelector('button')).not.toBeNull();
		expect(root.querySelector('[aria-busy]')).toBeNull();
	});

	it('성공하면 자리가 사라지고 차트가 그려진다', async () => {
		const { container } = render(Harness, { load: async () => Ok() });
		const root = container as HTMLElement;
		await expect.poll(() => root.querySelector('.chart-pending')).toBeNull();
		expect(root.querySelector('.fail-msg')).toBeNull();
	});
});

describe('ChartPending 높이는 뷰포트가 아니라 칸 폭을 따른다 (M1)', () => {
	it.each([
		[300, 260, 190],
		[300, 200, 190],
		[479, 260, 190],
		[480, 260, 260],
		[700, 200, 200],
		[300, 180, 180]
	] as const)('칸 폭 %ipx · 높이 %i → %ipx', (w, h, expected) => {
		const { container } = render(PendingWidth, { width: w, height: h });
		const el = slot(container as HTMLElement)!;
		expect(Math.round(el.getBoundingClientRect().height)).toBe(expected);
	});
});
