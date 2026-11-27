/**
 * 열린 시트와 토스트가 겹치면 `--mw-toast-bottom-lift` 를 쓴다(DS §7-0).
 * ToastGroup(지연 청크)과 ToastHost 대체 토스트가 같은 계산을 쓴다.
 */
import { toastBottomOffset } from './toastLift';

/** 열린 시트·모달: `role=dialog` + aria-modal, 닫히면 Sheet 가 inert 를 붙인다(클래스 이름에 기대지 않는다) */
const OPEN_DIALOG = '[role="dialog"][aria-modal="true"]:not([inert])';
const TOAST_BOX = '.mw-toasts[data-part="group"], [data-testid="toast-fallback"]';

export function defaultBottomPx(): number {
	// lift 변수를 읽지 않고 CSS 기본값과 같은 값을 쓴다(순환 계산 방지).
	if (window.matchMedia('(max-width: 639px)').matches) {
		const cs = getComputedStyle(document.documentElement);
		const tab = parseFloat(cs.getPropertyValue('--size-tabbar')) || 52;
		const inset = parseFloat(cs.getPropertyValue('--inset-b')) || 8;
		return tab + inset + 20;
	}
	return 24;
}

export function applyToastLift(): void {
	const sheet = document.querySelector(OPEN_DIALOG) as HTMLElement | null;
	watchSheet(sheet);
	const root = document.documentElement;
	if (!sheet) {
		root.style.removeProperty('--mw-toast-bottom-lift');
		return;
	}
	const sb = sheet.getBoundingClientRect();
	// visibility:hidden 인 닫힌 시트(클래스는 남을 수 있음)는 건너뛴다
	if (sb.height <= 0 || getComputedStyle(sheet).visibility === 'hidden') {
		root.style.removeProperty('--mw-toast-bottom-lift');
		return;
	}
	const group = document.querySelector(TOAST_BOX) as HTMLElement | null;
	const bar = document.querySelector('header.topbar') as HTMLElement | null;
	const toastW = Math.min(420, window.innerWidth - 32);
	const toastH = group?.getBoundingClientRect().height || 48;
	const next = toastBottomOffset({
		sheet: { top: sb.top, right: sb.right, bottom: sb.bottom, left: sb.left },
		viewportH: window.innerHeight,
		viewportW: window.innerWidth,
		toastH,
		toastW,
		defaultBottom: defaultBottomPx(),
		barBottom: bar?.getBoundingClientRect().bottom ?? 0
	});
	if (next == null) root.style.removeProperty('--mw-toast-bottom-lift');
	else root.style.setProperty('--mw-toast-bottom-lift', `${next}px`);
}

/**
 * 시트가 열리는 순간(class 변경)에는 아직 화면 밖(translateY)이라 겹침이 안 잡힌다 → 슬라이드가 끝난 뒤 다시 잰다.
 * 시트 안 자식(버튼 등)의 transitionend 는 걸러 낸다.
 */
function onTransitionEnd(e: TransitionEvent) {
	const t = e.target;
	if (t instanceof Element && t.matches('[role="dialog"]')) applyToastLift();
}

let ro: ResizeObserver | undefined;
let watched: HTMLElement | null = null;
function watchSheet(el: HTMLElement | null) {
	if (watched === el) return;
	if (watched) ro?.unobserve(watched);
	watched = el;
	if (el) ro?.observe(el);
}

/** 리스너를 붙이고, 끊을 때 lift 변수도 지운다. */
export function watchToastLift(): () => void {
	ro = new ResizeObserver(applyToastLift);
	document.addEventListener('transitionend', onTransitionEnd, true);
	const mo = new MutationObserver(applyToastLift);
	mo.observe(document.body, {
		subtree: true,
		attributes: true,
		attributeFilter: ['class'],
		childList: true
	});
	window.addEventListener('resize', applyToastLift);
	applyToastLift();
	return () => {
		mo.disconnect();
		ro?.disconnect();
		ro = undefined;
		watched = null;
		document.removeEventListener('transitionend', onTransitionEnd, true);
		window.removeEventListener('resize', applyToastLift);
		document.documentElement.style.removeProperty('--mw-toast-bottom-lift');
	};
}
