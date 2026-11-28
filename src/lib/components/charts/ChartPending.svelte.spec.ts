import '../../../app.css';
import { describe, expect, it, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ChartPending from './ChartPending.svelte';
import Harness from '../../../../tests/ui/ChartPendingToggleHarness.svelte';

afterEach(() => {
	document.documentElement.removeAttribute('data-theme');
});

describe('ChartPending', () => {
	it('로딩 중 aria-busy이고 문구는 없으며, 끝나면 해제된다', async () => {
		let done!: () => void;
		const deferred = new Promise<void>((resolve) => {
			done = resolve;
		});
		const { container } = render(Harness, { deferred, height: 180 });
		const root = container as HTMLElement;
		const slot = root.querySelector('.chart-pending');
		expect(slot).not.toBeNull();
		expect(slot?.getAttribute('aria-busy')).toBe('true');
		expect(slot?.textContent).toBe('');
		done();
		await expect.poll(() => root.querySelector('.chart-pending')).toBeNull();
		expect(root.querySelector('[aria-busy]')).toBeNull();
		expect(root.querySelector('[data-testid="chart-loaded"]')).not.toBeNull();
	});

	it('라이트는 surface-2·radius-md, 다크는 surface-3, 높이 180은 그대로', async () => {
		document.documentElement.setAttribute('data-theme', 'light');
		const { container } = render(ChartPending, { height: 180 });
		const slot = (container as HTMLElement).querySelector('.chart-pending') as HTMLElement;
		const light = getComputedStyle(slot);
		const surface2 = getComputedStyle(document.documentElement)
			.getPropertyValue('--color-surface-2')
			.trim();
		const radius = getComputedStyle(document.documentElement)
			.getPropertyValue('--radius-md')
			.trim();
		expect(light.backgroundColor).toBeTruthy();
		expect(light.borderRadius).toBe(radius || '12px');
		// 라이트 surface-2 #EEF0F4
		expect(light.backgroundColor).toBe('rgb(238, 240, 244)');
		expect(surface2.toLowerCase()).toBe('#eef0f4');
		expect(light.minHeight).toBe('180px');
		expect(Math.round(slot.getBoundingClientRect().height)).toBe(180);

		document.documentElement.setAttribute('data-theme', 'dark');
		const dark = getComputedStyle(slot);
		expect(dark.backgroundColor).toBe('rgb(40, 46, 59)'); // --color-surface-3 #282E3B
	});
});
