/**
 * 루트 레이아웃은 ExactValueSheet·ExactPopover를 처음부터 넣지 않는다(첫 화면 번들에서 Sheet를 뺀다).
 */
import '../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import Harness from '../../tests/ui/LayoutLazyHarness.svelte';
import { exactValue } from '$lib/components/ui/exactValue.svelte';
import { resetOpenSheets } from '$lib/components/ui/sheetStack';

afterEach(() => {
	exactValue.close();
	document.body.style.overflow = '';
	resetOpenSheets();
});

describe('루트 레이아웃 지연 로드', () => {
	it('처음에는 정확한 금액 시트가 없고, show() 뒤에 열린다', async () => {
		render(Harness);
		await tick();
		expect(document.querySelector('.sheet')).toBeNull();
		exactValue.show('총 평가금액', '₩1,000');
		await tick();
		await expect
			.poll(() => document.querySelector('.sheet.open'), { timeout: 3000 })
			.not.toBeNull();
		expect(document.querySelector('.sheet.open .value, .sheet.open .num')?.textContent).toContain(
			'₩1,000'
		);
	});
});
