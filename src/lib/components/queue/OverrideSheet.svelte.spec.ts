import '../../../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import OverrideSheet from './OverrideSheet.svelte';
import { resetOpenSheets } from '$lib/components/ui/sheetStack';
import { makeItem } from '../../../../tests/queue/testItem';

afterEach(() => {
	document.body.style.overflow = '';
	resetOpenSheets();
});

describe('OverrideSheet 접근성 이름', () => {
	it('고친 이유 입력의 이름은 머리글 + 라벨("고친 이유 한 줄, 필수")', async () => {
		await page.viewport(1280, 800);
		render(OverrideSheet, {
			props: {
				item: makeItem({
					change_type: 'open_holding',
					proposed_values: { qty: 13, avg_price: 214000, currency: 'KRW' }
				}),
				onclose: () => {},
				onsubmit: () => {}
			}
		});
		await expect
			.poll(() => document.querySelector('.sheet.open input[aria-labelledby]'), { timeout: 2000 })
			.not.toBeNull();
		const input = document.querySelector<HTMLInputElement>('.sheet.open input[aria-labelledby]')!;
		const name = input
			.getAttribute('aria-labelledby')!
			.split(' ')
			.map((id) => document.getElementById(id)?.textContent?.trim())
			.join(' ');
		expect(name).toBe('고친 이유 한 줄, 필수');
		expect(input.getAttribute('aria-describedby')).toBeTruthy();
	});
});
