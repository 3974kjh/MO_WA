import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BarChart from './BarChart.svelte';

const rects = (c: HTMLElement) => c.querySelectorAll('svg.chart rect');

describe('BarChart 렌더', () => {
	it('그려진 rect 수는 유한 값 개수와 같다(비유한은 생략)', async () => {
		const items = [
			{ label: 'a', value: 1 },
			{ label: 'b', value: Number.NaN },
			{ label: 'c', value: -2 },
			{ label: 'd', value: Number.POSITIVE_INFINITY },
			{ label: 'e', value: 0 }
		];
		const { container } = render(BarChart, { items, ariaLabel: '테스트 막대' });
		const finite = items.filter((i) => Number.isFinite(i.value)).length;
		await expect.poll(() => rects(container as HTMLElement).length).toBe(finite);
	});
	it('null 막대를 hover해도 나머지 막대가 흐려지지 않는다', async () => {
		const items = [
			{ label: 'a', value: 1 },
			{ label: 'b', value: Number.NaN },
			{ label: 'c', value: -2 }
		];
		const { container } = render(BarChart, { items, ariaLabel: '테스트 막대' });
		const root = container as HTMLElement;
		await expect.poll(() => rects(root).length).toBe(2);
		const plot = root.querySelector('.plot') as HTMLElement;
		const probe = root.querySelector('.bar-chart') as HTMLElement;
		probe.style.width = '800px';
		await new Promise((r) => setTimeout(r, 100));
		const box = plot.getBoundingClientRect();
		// 가운데 밴드(두 번째 = NaN)
		plot.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerType: 'mouse',
				clientX: box.left + 44 + (box.width - 52) / 2,
				clientY: box.top + 20,
				bubbles: true
			})
		);
		await new Promise((r) => setTimeout(r, 50));
		for (const r of rects(root)) expect(r.getAttribute('opacity')).toBe('1');
	});
});
