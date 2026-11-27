/**
 * v1.7.3 바텀시트 끌어 닫기: 손잡이·머리 포인터, 본문 터치, 임계값, 스크롤된 본문은 무시.
 */
import '../../../app.css';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { flushSync } from 'svelte';
import Harness from '../../../../tests/ui/SheetDragHarness.svelte';
import { resetOpenSheets } from './sheetStack';

const dlg = () => document.querySelector<HTMLElement>('[role="dialog"]');
const opener = () => document.querySelector<HTMLElement>('[data-testid="sheet-opener"]')!;
const grabBtn = () => dlg()?.querySelector<HTMLElement>('.grab');
const open = () => !dlg()?.hasAttribute('inert');

function openSheet() {
	render(Harness);
	opener().focus();
	opener().click();
	flushSync();
}

function point(el: Element, name: string, x: number, y: number, opts: PointerEventInit = {}) {
	el.dispatchEvent(
		new PointerEvent(name, {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
			pointerId: 1,
			pointerType: 'touch',
			...opts
		})
	);
}

function swipeGrabThenClick(dx: number, dy: number) {
	const sheet = dlg()!;
	const grab = grabBtn()!;
	const r = grab.getBoundingClientRect();
	const x = r.x + r.width / 2;
	const y = r.y + r.height / 2;
	point(grab, 'pointerdown', x, y, { button: 0 });
	point(sheet, 'pointermove', x + dx, y + dy);
	point(sheet, 'pointerup', x + dx, y + dy);
	grab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	flushSync();
	return sheet;
}

function touch(el: Element, name: string, x: number, y: number, withTouch: boolean) {
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
}

async function waitOpen() {
	await expect.poll(() => !!dlg() && open(), { timeout: 1000 }).toBe(true);
}

const pause = (ms = 160) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
	await page.viewport(390, 844);
});

afterEach(async () => {
	document.body.style.overflow = '';
	resetOpenSheets();
	await page.viewport(1280, 800);
});

describe('바텀시트 끌어 닫기 (v1.7.3)', () => {
	it('손잡이를 높이의 15%만 천천히 끌다 놓으면 열린 채로 돌아온다', async () => {
		openSheet();
		await waitOpen();
		const sheet = dlg()!;
		const grab = grabBtn()!;
		const r = grab.getBoundingClientRect();
		const x = r.x + r.width / 2;
		const y = r.y + r.height / 2;
		const dy = sheet.getBoundingClientRect().height * 0.15;
		point(grab, 'pointerdown', x, y, { button: 0 });
		await pause();
		point(sheet, 'pointermove', x, y + 8);
		await pause();
		point(sheet, 'pointermove', x, y + dy);
		expect(sheet.classList.contains('dragging')).toBe(true);
		// 마지막 100ms 속도를 0에 가깝게: 같은 자리에서 한 번 더 보고한 뒤 놓는다
		await pause(200);
		point(sheet, 'pointermove', x, y + dy);
		point(sheet, 'pointerup', x, y + dy);
		flushSync();
		await expect.poll(open, { timeout: 1000 }).toBe(true);
		expect(sheet.style.transform === '' || sheet.style.transform === 'none').toBe(true);
	});

	it('손잡이를 높이의 35%까지 끌다 놓으면 닫히고 포커스가 여는 버튼으로 돌아온다', async () => {
		openSheet();
		await waitOpen();
		const sheet = dlg()!;
		const grab = grabBtn()!;
		const r = grab.getBoundingClientRect();
		const x = r.x + r.width / 2;
		const y = r.y + r.height / 2;
		const dy = sheet.getBoundingClientRect().height * 0.35;
		point(grab, 'pointerdown', x, y, { button: 0 });
		point(sheet, 'pointermove', x, y + 8);
		point(sheet, 'pointermove', x, y + dy);
		point(sheet, 'pointerup', x, y + dy);
		flushSync();
		await expect.poll(() => dlg()?.hasAttribute('inert') ?? true, { timeout: 1000 }).toBe(true);
		expect(document.activeElement).toBe(opener());
	});

	it('머리(제목)에서 충분히 끌면 닫힌다', async () => {
		openSheet();
		await waitOpen();
		const sheet = dlg()!;
		const head = sheet.querySelector('.head')!;
		const r = head.getBoundingClientRect();
		const x = r.x + r.width / 2;
		const y = r.y + r.height / 2;
		const dy = sheet.getBoundingClientRect().height * 0.4;
		point(head, 'pointerdown', x, y, { button: 0 });
		point(sheet, 'pointermove', x, y + 8);
		point(sheet, 'pointermove', x, y + dy);
		point(sheet, 'pointerup', x, y + dy);
		flushSync();
		await expect.poll(() => dlg()?.hasAttribute('inert') ?? true, { timeout: 1000 }).toBe(true);
	});

	it('마우스로 본문을 끌면 닫히지 않는다', async () => {
		openSheet();
		await waitOpen();
		const sheet = dlg()!;
		const body = sheet.querySelector('.body')!;
		const r = body.getBoundingClientRect();
		const x = r.x + r.width / 2;
		const y = r.y + 10;
		const dy = sheet.getBoundingClientRect().height * 0.5;
		point(body, 'pointerdown', x, y, { button: 0, pointerType: 'mouse' });
		point(sheet, 'pointermove', x, y + 8, { pointerType: 'mouse' });
		point(sheet, 'pointermove', x, y + dy, { pointerType: 'mouse' });
		point(sheet, 'pointerup', x, y + dy, { pointerType: 'mouse' });
		flushSync();
		expect(open()).toBe(true);
		expect(sheet.classList.contains('dragging')).toBe(false);
	});

	it('터치로 본문을 맨 위에서 아래로 충분히 끌면 닫힌다', async () => {
		openSheet();
		await waitOpen();
		const sheet = dlg()!;
		sheet.scrollTop = 0;
		const body = sheet.querySelector('.body')!;
		const r = body.getBoundingClientRect();
		const x = r.x + r.width / 2;
		const y = r.y + 12;
		const dy = sheet.getBoundingClientRect().height * 0.4;
		touch(body, 'touchstart', x, y, true);
		touch(body, 'touchmove', x, y + 8, true);
		touch(body, 'touchmove', x, y + dy, true);
		touch(body, 'touchend', x, y + dy, false);
		flushSync();
		await expect.poll(() => dlg()?.hasAttribute('inert') ?? true, { timeout: 1000 }).toBe(true);
	});

	it('본문이 스크롤된 상태에서 아래로 끌면 닫히지 않는다', async () => {
		openSheet();
		await waitOpen();
		const sheet = dlg()!;
		sheet.scrollTop = 80;
		expect(sheet.scrollTop).toBeGreaterThan(0);
		const body = sheet.querySelector('.body')!;
		const r = body.getBoundingClientRect();
		const x = r.x + r.width / 2;
		const y = r.y + 12;
		const dy = sheet.getBoundingClientRect().height * 0.5;
		touch(body, 'touchstart', x, y, true);
		touch(body, 'touchmove', x, y + 8, true);
		touch(body, 'touchmove', x, y + dy, true);
		touch(body, 'touchend', x, y + dy, false);
		flushSync();
		expect(open()).toBe(true);
		expect(sheet.classList.contains('dragging')).toBe(false);
	});

	it('위로 끌면 시트가 움직이지 않고 열린 채다', async () => {
		openSheet();
		await waitOpen();
		const sheet = dlg()!;
		const grab = grabBtn()!;
		const r = grab.getBoundingClientRect();
		const x = r.x + r.width / 2;
		const y = r.y + r.height / 2;
		point(grab, 'pointerdown', x, y, { button: 0 });
		point(sheet, 'pointermove', x, y - 8);
		point(sheet, 'pointermove', x, y - 80);
		expect(sheet.classList.contains('dragging')).toBe(false);
		point(sheet, 'pointerup', x, y - 80);
		flushSync();
		expect(open()).toBe(true);
	});

	it('손잡이에서 위로 15px 움직였다 놓으면 click이 와도 열린 채다 (v1.7.4)', async () => {
		openSheet();
		await waitOpen();
		swipeGrabThenClick(0, -15);
		expect(open()).toBe(true);
		expect(dlg()!.classList.contains('dragging')).toBe(false);
	});

	it('손잡이에서 옆으로 30px 움직였다 놓으면 click이 와도 열린 채다 (v1.7.4)', async () => {
		openSheet();
		await waitOpen();
		swipeGrabThenClick(30, 0);
		expect(open()).toBe(true);
		expect(dlg()!.classList.contains('dragging')).toBe(false);
	});

	it('3px 흔들린 탭은 닫힌다 (슬롭 안, v1.7.4)', async () => {
		openSheet();
		await waitOpen();
		swipeGrabThenClick(3, 0);
		flushSync();
		await expect.poll(() => dlg()?.hasAttribute('inert') ?? true, { timeout: 1000 }).toBe(true);
		expect(document.activeElement).toBe(opener());
	});

	it('손잡이에서 Space를 누르면 닫힌다 (v1.7.4)', async () => {
		openSheet();
		await waitOpen();
		const grab = grabBtn()!;
		grab.focus();
		expect(document.activeElement).toBe(grab);
		// Space/Enter는 버튼의 click 활성화를 탄다(vitest page.keyboard 없음). 기존 Enter 테스트와 같은 경로.
		grab.dispatchEvent(
			new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })
		);
		grab.click();
		flushSync();
		await expect.poll(() => dlg()?.hasAttribute('inert') ?? true, { timeout: 1000 }).toBe(true);
		expect(document.activeElement).toBe(opener());
	});

	it('≥640 중앙 모달은 X가 보이고 손잡이는 숨기며 끌기를 무시한다', async () => {
		await page.viewport(1280, 800);
		openSheet();
		await waitOpen();
		const sheet = dlg()!;
		const grab = grabBtn()!;
		const close = sheet.querySelector<HTMLElement>('.close')!;
		expect(getComputedStyle(grab).display).toBe('none');
		expect(getComputedStyle(close).display).not.toBe('none');
		const head = sheet.querySelector('.head')!;
		const r = head.getBoundingClientRect();
		const x = r.x + r.width / 2;
		const y = r.y + r.height / 2;
		point(head, 'pointerdown', x, y, { button: 0 });
		point(sheet, 'pointermove', x, y + 8);
		point(sheet, 'pointermove', x, y + 200);
		point(sheet, 'pointerup', x, y + 200);
		flushSync();
		expect(open()).toBe(true);
		expect(sheet.classList.contains('dragging')).toBe(false);
	});
});
