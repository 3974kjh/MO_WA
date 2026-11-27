/**
 * L-1: 확인 시트의 첫 포커스 대상이 .btn 이면, Skeleton `transition: all` 때문에
 * 열린 직후 focus()가 무시되던 문제를 막는다. 실 브라우저에서 포커스·Esc·Tab 가둠을 확인한다.
 */
import '../../../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';
import Harness from '../../../../tests/ui/SheetFocusHarness.svelte';
import { resetOpenSheets } from './sheetStack';

const dlg = () => document.querySelector<HTMLElement>('[role="dialog"]');
const opener = () => document.querySelector<HTMLElement>('[data-testid="sheet-opener"]')!;
const confirm = () => document.querySelector<HTMLElement>('[data-testid="sheet-confirm"]')!;
const cancel = () => document.querySelector<HTMLElement>('[data-testid="sheet-cancel"]')!;
const closeBtn = () => dlg()?.querySelector<HTMLElement>('.close');
const inside = () => !!dlg() && dlg()!.contains(document.activeElement);

function openSheet() {
	render(Harness);
	opener().focus();
	opener().click();
	flushSync();
}

function key(el: HTMLElement | Document, key: string, shift = false) {
	el.dispatchEvent(
		new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true })
	);
	flushSync();
}

afterEach(() => {
	document.body.style.overflow = '';
	resetOpenSheets();
});

describe('Sheet 확인 시트 포커스 (L-1, 첫 대상이 .btn)', () => {
	it('열리면 포커스가 시트 안(닫기 다음 요소, 보통 취소)으로 들어가고 버튼은 이미 보인다', async () => {
		openSheet();
		await expect.poll(inside, { timeout: 1000 }).toBe(true);
		expect(getComputedStyle(cancel()).visibility).toBe('visible');
		expect(document.activeElement).toBe(cancel());
	});

	it('Esc로 닫히고, 포커스가 여는 버튼으로 돌아온다', async () => {
		openSheet();
		await expect.poll(inside, { timeout: 1000 }).toBe(true);
		key(document.activeElement as HTMLElement, 'Escape');
		await expect.poll(() => dlg()?.hasAttribute('inert') ?? true, { timeout: 1000 }).toBe(true);
		expect(document.activeElement).toBe(opener());
	});

	it('포커스가 시트 밖에 남아 있어도 Esc로 닫힌다', async () => {
		openSheet();
		await expect.poll(() => dlg() && !dlg()!.hasAttribute('inert'), { timeout: 1000 }).toBe(true);
		opener().focus();
		expect(inside()).toBe(false);
		key(document, 'Escape');
		await expect.poll(() => dlg()?.hasAttribute('inert') ?? true, { timeout: 1000 }).toBe(true);
	});

	it('Tab은 시트 안에서만 순환한다(가둠)', async () => {
		openSheet();
		await expect.poll(inside, { timeout: 1000 }).toBe(true);
		const close = closeBtn()!;
		// 푸터 끝(사용 중지)에서 Tab → 첫 요소(닫기)
		confirm().focus();
		key(confirm(), 'Tab');
		expect(document.activeElement).toBe(close);
		// 닫기에서 Shift+Tab → 마지막(사용 중지)
		key(close, 'Tab', true);
		expect(document.activeElement).toBe(confirm());
		expect(inside()).toBe(true);
	});
});

describe('겹친 시트 Esc (L-2)', () => {
	it('전체 시트 위 확인 시트에서 Esc 한 번은 맨 위만 닫고, 두 번째는 아래 시트를 닫는다', async () => {
		const Harness = (await import('../../../../tests/ui/StackedSheetHarness.svelte')).default;
		render(Harness);
		const opener = document.querySelector<HTMLElement>('[data-testid="stack-opener"]')!;
		opener.focus();
		opener.click();
		flushSync();
		const archive = document.querySelector<HTMLElement>('[data-testid="stack-archive"]')!;
		await expect
			.poll(() => !!document.querySelector('.sheet.full.open'), { timeout: 1000 })
			.toBe(true);
		archive.focus();
		archive.click();
		flushSync();
		await expect
			.poll(() => !!document.querySelector('[data-action="journal-archive-confirm"]'), {
				timeout: 1000
			})
			.toBe(true);
		const dialogs = () =>
			[...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(
				(d) => !d.hasAttribute('inert')
			);
		expect(dialogs()).toHaveLength(2);
		key(document, 'Escape');
		await expect.poll(() => dialogs().length, { timeout: 1000 }).toBe(1);
		expect(document.querySelector('.sheet.full.open')?.hasAttribute('inert')).toBe(false);
		expect(document.activeElement).toBe(archive);
		key(document, 'Escape');
		await expect.poll(() => dialogs().length, { timeout: 1000 }).toBe(0);
		expect(document.activeElement).toBe(opener);
	});
});
