/**
 * 바텀시트 아래로 끌어 닫기 (DS v1.7.3 §7-11-1, handoff §20-3)
 * - 끄는 곳: 손잡이(.grab)·머리(.head) = 포인터(터치·마우스·펜, CSS touch-action:none)
 *            본문 = 터치로만, 시트가 맨 위(scrollTop 0)이고 아래로 끌 때만(위로·옆으로면 스크롤에 양보)
 * - 놓을 때 끈 거리 > 시트 높이 25% 또는 속도 > 0.5px/ms 이면 onclose(), 아니면 제자리로(CSS 전환)
 * - 스크림은 끈 비율만큼 옅어진다. <640 && enabled 일 때만 동작(≥640 중앙 모달은 끌기 없음)
 */
export const DRAG_SLOP = 6;
export const DISMISS_RATIO = 0.25;
export const DISMISS_VELOCITY = 0.5; // px/ms

/** 순수 판정(단위 테스트용) */
export function shouldDismiss(dy: number, height: number, velocity: number): boolean {
	return dy > height * DISMISS_RATIO || velocity > DISMISS_VELOCITY;
}

/** 본문 터치 끌기를 시작할 수 있는지(맨 위일 때만). */
export function canBeginBodyDrag(scrollTop: number): boolean {
	return scrollTop <= 0;
}

/**
 * 슬롭을 넘긴 뒤의 방향 판정.
 * wait = 아직 6px 안쪽, arm = 아래로 세로 끌기 시작, abort = 위·가로(스크롤에 양보)
 */
export function decideDragIntent(dx: number, dy: number): 'wait' | 'arm' | 'abort' {
	if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return 'wait';
	if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) return 'abort';
	return 'arm';
}

type Params = { enabled: boolean; onclose: () => void; scrim: () => HTMLElement | undefined };
const NO_BODY_DRAG = 'input,textarea,select,[contenteditable],.table-wrap,.mw-table-wrap';
const NO_HEAD_DRAG = '.head button:not(.grab),.head a,.head input';

export function sheetDrag(node: HTMLElement, params: Params) {
	let p = params;
	const mq = window.matchMedia('(max-width: 639px)');
	type Drag = {
		x0: number;
		y0: number;
		h: number;
		on: boolean;
		dy: number;
		pts: [number, number][];
		pid?: number;
		touch?: boolean;
		aborted?: boolean; // 슬롭을 넘겼지만 위·옆 → 끌기 아님, 그래도 click 은 버림
	};
	let d: Drag | null = null;
	let suppressClick = false;
	const active = () => p.enabled && mq.matches;

	function begin(x: number, y: number, t: number): Drag {
		return {
			x0: x,
			y0: y,
			h: node.getBoundingClientRect().height,
			on: false,
			dy: 0,
			pts: [[t, y]]
		};
	}
	function move(x: number, y: number, t: number): boolean {
		if (!d || d.aborted) return false;
		const dx = x - d.x0;
		const dy = y - d.y0;
		if (!d.on) {
			const intent = decideDragIntent(dx, dy);
			if (intent === 'wait') return false;
			if (intent === 'abort') {
				d.aborted = true;
				return false;
			}
			d.on = true;
			node.classList.add('dragging');
			p.scrim()?.classList.add('dragging');
		}
		d.dy = Math.max(0, dy);
		node.style.transform = `translateY(${d.dy}px)`;
		const s = p.scrim();
		if (s) s.style.opacity = String(Math.max(0, 1 - d.dy / d.h));
		d.pts.push([t, y]);
		while (d.pts.length > 2 && t - d.pts[0][0] > 100) d.pts.shift();
		return true;
	}
	function suppressNextClick() {
		suppressClick = true;
		setTimeout(() => (suppressClick = false), 0);
	}
	function end(cancelled = false) {
		if (!d) return;
		const g = d;
		d = null;
		if (!g.on) {
			if (g.aborted) suppressNextClick();
			return;
		}
		suppressNextClick();
		const a = g.pts[0];
		const b = g.pts[g.pts.length - 1];
		const v = b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
		node.classList.remove('dragging');
		node.style.transform = '';
		const s = p.scrim();
		if (s) {
			s.classList.remove('dragging');
			s.style.opacity = '';
		}
		if (!cancelled && shouldDismiss(g.dy, g.h, v)) p.onclose();
	}

	function onpointerdown(e: PointerEvent) {
		if (!active() || e.button > 0) return;
		const t = e.target as Element;
		const zone = t.closest('.grab,.head');
		if (!zone || !node.contains(zone) || t.closest(NO_HEAD_DRAG)) return;
		d = begin(e.clientX, e.clientY, e.timeStamp);
		d.pid = e.pointerId;
		(zone as HTMLElement).setPointerCapture?.(e.pointerId);
	}
	function onpointermove(e: PointerEvent) {
		if (d && d.pid === e.pointerId && move(e.clientX, e.clientY, e.timeStamp)) e.preventDefault();
	}
	function onpointerup(e: PointerEvent) {
		if (d && d.pid === e.pointerId) end();
	}
	function onpointercancel(e: PointerEvent) {
		if (d && d.pid === e.pointerId) end(true);
	}
	function onclickcapture(e: MouseEvent) {
		if (suppressClick && (e.target as Element).closest('.grab')) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}
	function ontouchstart(e: TouchEvent) {
		if (!active() || d || e.touches.length !== 1) return;
		const t = e.target as Element;
		if (t.closest('.grab,.head') || t.closest(NO_BODY_DRAG) || !canBeginBodyDrag(node.scrollTop))
			return;
		const pt = e.touches[0];
		d = begin(pt.clientX, pt.clientY, e.timeStamp);
		d.touch = true;
	}
	function ontouchmove(e: TouchEvent) {
		if (!d?.touch) return;
		if (!d.on && !canBeginBodyDrag(node.scrollTop)) {
			d = null;
			return;
		}
		const pt = e.touches[0];
		if (move(pt.clientX, pt.clientY, e.timeStamp) && e.cancelable) e.preventDefault();
	}
	function ontouchend() {
		if (d?.touch) end();
	}
	function ontouchcancel() {
		if (d?.touch) end(true);
	}

	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('pointermove', onpointermove);
	node.addEventListener('pointerup', onpointerup);
	node.addEventListener('pointercancel', onpointercancel);
	node.addEventListener('click', onclickcapture, true);
	node.addEventListener('touchstart', ontouchstart, { passive: true });
	node.addEventListener('touchmove', ontouchmove, { passive: false });
	node.addEventListener('touchend', ontouchend);
	node.addEventListener('touchcancel', ontouchcancel);
	return {
		update(next: Params) {
			p = next;
			if (!p.enabled) end(true);
		},
		destroy() {
			node.removeEventListener('pointerdown', onpointerdown);
			node.removeEventListener('pointermove', onpointermove);
			node.removeEventListener('pointerup', onpointerup);
			node.removeEventListener('pointercancel', onpointercancel);
			node.removeEventListener('click', onclickcapture, true);
			node.removeEventListener('touchstart', ontouchstart);
			node.removeEventListener('touchmove', ontouchmove);
			node.removeEventListener('touchend', ontouchend);
			node.removeEventListener('touchcancel', ontouchcancel);
		}
	};
}
