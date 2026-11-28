import { describe, expect, it } from 'vitest';
import { boundsOf, clusterPoints, worldPixel } from './cluster';

const P = (id: string, lat: number, lng: number) => ({ id, lat, lng });

describe('격자 클러스터', () => {
	it('세계 픽셀: 줌 0에서 (0,0)은 가운데, 줌이 1 오르면 두 배', () => {
		const a = worldPixel(0, 0, 0);
		expect(a.x).toBeCloseTo(128);
		expect(a.y).toBeCloseTo(128);
		const b = worldPixel(37.5, 127, 9);
		const c = worldPixel(37.5, 127, 10);
		expect(c.x / b.x).toBeCloseTo(2);
		expect(c.y / b.y).toBeCloseTo(2);
	});

	it('멀리 보면 가까운 단지는 한 묶음, 확대하면 갈라진다', () => {
		const pts = [P('a', 37.7, 126.73), P('b', 37.705, 126.735), P('c', 37.0, 127.1)];
		const far = clusterPoints(pts, 8);
		expect(far.map((c) => c.items.map((i) => i.id).sort())).toEqual(
			expect.arrayContaining([['a', 'b'], ['c']])
		);
		const near = clusterPoints(pts, 13);
		expect(near).toHaveLength(3);
	});

	it('maxZoom 이상에서는 같은 위치(소수 4자리)만 묶는다', () => {
		const pts = [P('a', 37.70001, 126.73001), P('b', 37.70002, 126.73002), P('c', 37.7005, 126.73)];
		const z = clusterPoints(pts, 15, { maxZoom: 14 });
		expect(z.map((c) => c.items.length).sort()).toEqual([1, 2]);
	});

	it('묶음 위치는 평균, 경계는 최소·최대', () => {
		const [c] = clusterPoints([P('a', 37, 127), P('b', 37.02, 127.02)], 5);
		expect(c.lat).toBeCloseTo(37.01);
		expect(c.lng).toBeCloseTo(127.01);
		expect(c.bounds).toEqual({ south: 37, west: 127, north: 37.02, east: 127.02 });
		expect(boundsOf([P('x', 1, 2)])).toEqual({ south: 1, west: 2, north: 1, east: 2 });
	});

	it('빈 입력은 빈 결과', () => {
		expect(clusterPoints([], 9)).toEqual([]);
	});
});
