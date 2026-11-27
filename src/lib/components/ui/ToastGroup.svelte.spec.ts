/**
 * ToastGroup 위치: 열린 시트의 *실제* 윗선 12px 위 (L-1: 토스트가 먼저 떠 있고 시트가 나중에 열려도).
 * 실제 브라우저 레이아웃·전환으로 잰다(app.css 의 --mw-toast-bottom 포함).
 */
import '../../../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { flushSync } from 'svelte';
import Harness from './ToastSheetHarness.svelte';
import { toast } from './toast.svelte';

const toastEl = () => document.querySelector<HTMLElement>('[data-scope="toast"][data-part="root"]');
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const gapToSheet = () => {
	const t = toastEl();
	const d = dialog();
	return t && d
		? Math.round(d.getBoundingClientRect().top - t.getBoundingClientRect().bottom)
		: NaN;
};
const lift = () => document.documentElement.style.getPropertyValue('--mw-toast-bottom-lift');
const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms)); // 토스트 등장 애니메이션 종료
const showToast = (msg = '반영했어요') => {
	toast.show(msg, { duration: 0 }); // 자동 사라짐 끔(테스트가 직접 치움)
	flushSync();
};
const openSheet = async () => {
	await page.getByRole('button', { name: '시트 열기' }).click();
};

afterEach(async () => {
	for (const t of [...toast.items]) toast.dismiss(t.id);
	document.querySelectorAll('.fake-sheet').forEach((e) => e.remove());
	await page.viewport(414, 896);
});

describe('ToastGroup 시트 위 12px', () => {
	it('375: 토스트가 먼저 떠 있다가 시트가 열리면, 슬라이드가 끝난 뒤 토스트가 시트 윗선 12px 위로 올라간다 (L-1)', async () => {
		await page.viewport(375, 720);
		render(Harness);
		showToast();
		await expect.poll(toastEl).not.toBeNull();
		await settle();
		const tb0 = toastEl()!.getBoundingClientRect().bottom;
		await openSheet();
		await expect.poll(gapToSheet, { timeout: 3000 }).toBe(12);
		expect(toastEl()!.getBoundingClientRect().bottom).toBeLessThan(tb0); // 실제로 올라감
		expect(lift()).not.toBe('');
	});

	it('375: 반대 순서(시트 먼저, 토스트 나중)도 12px', async () => {
		await page.viewport(375, 720);
		render(Harness);
		await openSheet();
		await expect
			.poll(() => dialog()!.getBoundingClientRect().top < 720 - 100, { timeout: 3000 })
			.toBe(true);
		await new Promise((r) => setTimeout(r, 400)); // 슬라이드 종료
		showToast();
		await expect.poll(gapToSheet, { timeout: 3000 }).toBe(12);
	});

	it('375: 시트가 닫히면 lift 가 풀리고 토스트가 기본 위치로 돌아온다', async () => {
		await page.viewport(375, 720);
		render(Harness);
		showToast();
		await expect.poll(toastEl).not.toBeNull();
		await settle();
		const tb0 = Math.round(toastEl()!.getBoundingClientRect().bottom);
		await openSheet();
		await expect.poll(gapToSheet, { timeout: 3000 }).toBe(12);
		dialog()!.querySelector<HTMLElement>('.close')!.click(); // 닫기 버튼
		await expect.poll(lift, { timeout: 3000 }).toBe('');
		await expect
			.poll(() => Math.round(toastEl()!.getBoundingClientRect().bottom), { timeout: 3000 })
			.toBe(tb0);
	});

	it('375: 열린 시트의 높이가 (DOM·class 변경 없이) 바뀌어도 12px 가 유지된다 (ResizeObserver)', async () => {
		await page.viewport(375, 720);
		render(Harness, { lines: 2 });
		showToast();
		await openSheet();
		await expect.poll(gapToSheet, { timeout: 3000 }).toBe(12);
		const h0 = dialog()!.getBoundingClientRect().height;
		// style 만 바꾼다 → MutationObserver(class·childList)는 못 보고 크기만 달라진다
		dialog()!.querySelector<HTMLElement>('.body')!.style.paddingBottom = '120px';
		await expect
			.poll(() => dialog()!.getBoundingClientRect().height, { timeout: 3000 })
			.toBeGreaterThan(h0 + 100);
		await expect.poll(gapToSheet, { timeout: 3000 }).toBe(12);
	});

	it('768: 가운데 모달은 토스트와 안 겹치므로 lift 없음', async () => {
		await page.viewport(768, 900);
		render(Harness, { variant: 'center' });
		showToast();
		await openSheet();
		await new Promise((r) => setTimeout(r, 500));
		expect(lift()).toBe('');
	});

	it('Nit-2: role=dialog 가 아닌 `.sheet.open` 요소나 inert 인 dialog 는 lift 를 만들지 않는다', async () => {
		await page.viewport(375, 720);
		render(Harness);
		const fake = document.createElement('div');
		fake.className = 'sheet open fake-sheet';
		fake.style.cssText =
			'position:fixed;left:0;right:0;bottom:0;height:400px;background:#ccc;z-index:5';
		document.body.appendChild(fake);
		const inertDlg = document.createElement('div');
		inertDlg.className = 'fake-sheet';
		inertDlg.setAttribute('role', 'dialog');
		inertDlg.setAttribute('aria-modal', 'true');
		inertDlg.setAttribute('inert', '');
		inertDlg.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:400px;z-index:5';
		document.body.appendChild(inertDlg);
		showToast();
		await expect.poll(toastEl).not.toBeNull();
		await new Promise((r) => setTimeout(r, 300));
		expect(lift()).toBe('');
	});
});
