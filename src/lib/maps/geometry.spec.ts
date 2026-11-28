import { describe, expect, it } from 'vitest';
import { autoPanDy, CARD_W, nearestInDirection, panDelta, placeCard, type Box } from './geometry';

const b = (x: number, y: number): Box => ({ left: x - 22, top: y - 22, width: 44, height: 44 });

describe('방향키 이웃 찾기', () => {
	// 가운데(0)를 중심으로 동서남북 + 먼 대각선
	const boxes = [b(200, 200), b(300, 205), b(100, 190), b(205, 80), b(195, 330), b(400, 600)];
	it('그 방향에서 가장 가까운 이웃으로 간다', () => {
		expect(nearestInDirection(boxes, 0, 'ArrowRight')).toBe(1);
		expect(nearestInDirection(boxes, 0, 'ArrowLeft')).toBe(2);
		expect(nearestInDirection(boxes, 0, 'ArrowUp')).toBe(3);
		expect(nearestInDirection(boxes, 0, 'ArrowDown')).toBe(4);
	});
	it('옆으로 너무 벗어난 것은 후보가 아니다(진행 거리의 1.2배 초과)', () => {
		expect(nearestInDirection([b(0, 0), b(100, 150)], 0, 'ArrowRight')).toBe(-1);
		expect(nearestInDirection([b(0, 0), b(100, 150)], 0, 'ArrowDown')).toBe(1);
	});
	it('가장자리에서는 -1(그 자리에 머문다)', () => {
		expect(nearestInDirection(boxes, 2, 'ArrowLeft')).toBe(-1);
		expect(nearestInDirection([], 0, 'ArrowUp')).toBe(-1);
	});
	it('Shift+방향키 이동량', () => {
		expect(panDelta('ArrowLeft')).toEqual({ x: -120, y: 0 });
		expect(panDelta('ArrowDown')).toEqual({ x: 0, y: 120 });
	});
});

describe('카드 자리·자동 이동(PC)', () => {
	const map = { w: 700, h: 600 };
	const tear = { tear: true, pinH: 43 };
	it('위에 자리가 있으면 위쪽(화살표 아래로)', () => {
		const p = placeCard({ x: 350, y: 400, ...tear }, { h: 200 }, map);
		expect(p.cls).toBe('up');
		expect(p.left).toBeCloseTo(350 - CARD_W / 2);
		expect(p.top).toBeLessThan(400);
		expect(p.ax).toBeCloseTo(CARD_W / 2);
	});
	it('위가 모자라면 아래쪽', () => {
		const p = placeCard({ x: 350, y: 120, ...tear }, { h: 200 }, map);
		expect(p.cls).toBe('down');
		expect(p.top).toBeGreaterThan(120);
	});
	it('위·아래가 다 모자라면 옆(오른쪽 먼저, 안 되면 왼쪽)', () => {
		const small = { w: 700, h: 300 };
		expect(placeCard({ x: 120, y: 200, ...tear }, { h: 260 }, small).cls).toBe('r');
		expect(placeCard({ x: 600, y: 200, ...tear }, { h: 260 }, small).cls).toBe('l');
	});
	it('가장자리 핀은 카드가 지도 밖으로 나가지 않는다', () => {
		const p = placeCard({ x: 10, y: 400, ...tear }, { h: 200 }, map);
		expect(p.left).toBeGreaterThanOrEqual(12);
		const q = placeCard({ x: 695, y: 400, ...tear }, { h: 200 }, map);
		expect(q.left + CARD_W).toBeLessThanOrEqual(map.w - 12);
	});
	it('어느 쪽에도 안 들어갈 때만 지도를 민다', () => {
		expect(autoPanDy({ x: 350, y: 400, ...tear }, { h: 200 }, map, true)).toBe(0);
		const tiny = { w: 340, h: 300 };
		expect(autoPanDy({ x: 170, y: 150, ...tear }, { h: 260 }, tiny, true)).not.toBe(0);
	});
	it('태블릿: 카드가 지도 아래를 덮으면 핀을 위로 올린다', () => {
		const dy = autoPanDy({ x: 300, y: 560, ...tear }, { h: 200 }, map, false);
		expect(dy).toBeLessThan(0);
		expect(autoPanDy({ x: 300, y: 200, ...tear }, { h: 150 }, map, false)).toBe(0);
	});
});
