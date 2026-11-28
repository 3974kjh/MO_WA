/**
 * 지도 위 화면 기하(순수 함수) — 시안 v1.7.8 shared/realestate-map.js 의 방향키 이동·카드 자리·자동 이동을 옮김.
 * DOM·SDK에 기대지 않아 단독으로 시험한다.
 */

export type Dir = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
export interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}

const DIRS: Record<Dir, readonly [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1]
};

export const isDir = (k: string): k is Dir => k in DIRS;

/**
 * 현재 핀에서 그 방향으로 가장 가까운 이웃의 인덱스(없으면 -1).
 * 방향 쪽으로 4px 넘게 떨어져 있고 옆으로 벗어난 정도가 진행 거리의 1.2배 이하인 것만 후보,
 * 점수 = 진행 거리 + 옆 거리 × 1.5.
 */
export function nearestInDirection(boxes: readonly Box[], from: number, dir: Dir): number {
	const f = boxes[from];
	if (!f) return -1;
	const [ux, uy] = DIRS[dir];
	const cx = f.left + f.width / 2;
	const cy = f.top + f.height / 2;
	let best = -1;
	let bs = Infinity;
	boxes.forEach((b, i) => {
		if (i === from) return;
		const dx = b.left + b.width / 2 - cx;
		const dy = b.top + b.height / 2 - cy;
		const along = dx * ux + dy * uy;
		const perp = Math.abs(dx * uy - dy * ux);
		if (along <= 4 || perp > along * 1.2) return;
		const s = along + perp * 1.5;
		if (s < bs) {
			bs = s;
			best = i;
		}
	});
	return best;
}

/** Shift+방향키로 지도를 미는 픽셀(중심이 방향으로 120px). */
export function panDelta(dir: Dir, step = 120): { x: number; y: number } {
	const [ux, uy] = DIRS[dir];
	return { x: ux * step, y: uy * step };
}

export const CARD_W = 328;

export interface PinGeom {
	/** 지도 상자 기준 핀 위치: 물방울은 뾰족한 끝, 그 밖은 중심 */
	x: number;
	y: number;
	tear: boolean;
	/** 물방울 핀 높이(최우선 50, 일반 43), 그 밖은 0 */
	pinH: number;
}

export interface CardPlace {
	cls: 'up' | 'down' | 'l' | 'r';
	left: number;
	top: number;
	ax?: number;
	ay?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 데스크톱(≥1024) 카드 자리: 위 → 아래 → 오른쪽 → 왼쪽 순으로 들어가는 곳에 화살표와 함께 놓는다. */
export function placeCard(
	pin: PinGeom,
	card: { h: number },
	map: { w: number; h: number }
): CardPlace {
	const w = CARD_W;
	const { x, y, tear, pinH } = pin;
	const half = tear ? 20 : 16;
	const tipTop = y - (tear ? pinH * 1.14 + 4 : 16);
	const tipBot = y + (tear ? 2 : 14);
	const h = card.h;
	if (tipTop - 12 - h >= 8) {
		const left = clamp(x - w / 2, 12, Math.max(12, map.w - w - 12));
		return { cls: 'up', left, top: tipTop - 12 - h, ax: clamp(x - left, 22, w - 22) };
	}
	if (tipBot + 12 + h <= map.h - 30) {
		const left = clamp(x - w / 2, 12, Math.max(12, map.w - w - 12));
		return { cls: 'down', left, top: tipBot + 12, ax: clamp(x - left, 22, w - 22) };
	}
	const cy = y - (tear ? pinH / 2 : 0);
	const top = clamp(cy - h / 2, 8, Math.max(8, map.h - h - 34));
	const ay = clamp(cy - top, 22, h - 22);
	if (x + half + 14 + w <= map.w - 8) return { cls: 'r', left: x + half + 14, top, ay };
	return { cls: 'l', left: Math.max(8, x - half - 14 - w), top, ay };
}

/**
 * 카드가 핀을 가리거나 지도 밖으로 나가면 지도를 얼마나 아래(+)·위(−)로 밀어야 하는지(핀의 화면 이동량, px).
 * pc: 4방향 어디에도 안 들어갈 때만 밀고, 태블릿(카드가 지도 아래에 붙음)은 핀이 카드 위로 오게 민다.
 */
export function autoPanDy(
	pin: PinGeom,
	card: { h: number },
	map: { w: number; h: number },
	pc: boolean
): number {
	const { x, y, pinH } = pin;
	const h = card.h;
	if (pc) {
		const up = y - pinH * 1.14 - 18 - h >= 8;
		const down = y + 14 + 12 + h <= map.h - 30;
		const sideR = x + 34 + CARD_W <= map.w - 8;
		const sideL = x - 34 - CARD_W >= 8;
		if (up || down || sideR || sideL) return 0;
		return Math.min(map.h - 40, pinH * 1.14 + 18 + h + 12) - y;
	}
	const lim = map.h - (h + 34) - 16 - 26;
	let dy = 0;
	if (y > lim) dy = lim - y;
	if (y + dy - pinH < 64) dy = 64 + pinH - y;
	return dy;
}
