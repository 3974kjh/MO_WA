import '../../../app.css';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Harness from '../../../../tests/ui/DonutPendingToggleHarness.svelte';

const ITEMS = [
	{ label: 'NAVER', value: 9_940_000 },
	{ label: '알파벳 A', value: 4_677_120 },
	{ label: '로보티즈', value: 2_140_000 },
	{ label: '현대차', value: 2_215_000 },
	{ label: '미국채 30년', value: 630_700 }
];

describe('DonutPending', () => {
	it('범례를 포함해 로드 전후 상자 높이가 같다(좁은 폭·넓은 폭)', async () => {
		for (const width of [324, 720]) {
			let done!: () => void;
			const deferred = new Promise<void>((resolve) => {
				done = resolve;
			});
			const { container } = render(Harness, { deferred, items: ITEMS });
			const root = container as HTMLElement;
			root.style.width = `${width}px`;
			const shell = () => root.querySelector('.donut-shell') as HTMLElement;
			await expect.poll(() => shell()).not.toBeNull();
			const pendingH = Math.round(shell().getBoundingClientRect().height);
			expect(root.querySelector('.chart-pending[aria-busy="true"]')).not.toBeNull();
			expect(root.querySelectorAll('.leg-table tbody tr').length).toBeGreaterThan(1);
			expect(pendingH).toBeGreaterThan(180);
			done();
			await expect.poll(() => root.querySelector('.chart-pending')).toBeNull();
			const loadedH = Math.round(shell().getBoundingClientRect().height);
			expect(loadedH).toBe(pendingH);
			root.innerHTML = '';
		}
	});
});
