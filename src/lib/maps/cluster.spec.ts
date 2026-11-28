import { describe, expect, it } from 'vitest';
import {
	boundsOf,
	CLUSTER_MAX_ZOOM,
	clusterByDistance,
	clusterRadius,
	worldPixel,
	type GeoPoint
} from './cluster';

const P = (id: string, lat: number, lng: number): GeoPoint => ({ id, lat, lng });
const at = (zoom: number) => (p: GeoPoint) => worldPixel(p.lat, p.lng, zoom);

describe('거리 기반 클러스터', () => {
	it('세계 픽셀: 줌 0에서 (0,0)은 가운데, 줌이 1 오르면 두 배', () => {
		const a = worldPixel(0, 0, 0);
		expect(a.x).toBeCloseTo(128);
		expect(a.y).toBeCloseTo(128);
		const b = worldPixel(37.5, 127, 9);
		const c = worldPixel(37.5, 127, 10);
		expect(c.x / b.x).toBeCloseTo(2);
		expect(c.y / b.y).toBeCloseTo(2);
	});

	it('반지름은 멀리 볼수록 넓다(시안 40·34·28)', () => {
		expect([8, 11, 13, 14].map(clusterRadius)).toEqual([40, 34, 28, 28]);
	});

	it('멀리 보면 가까운 단지는 한 묶음, 확대하면 갈라진다', () => {
		const pts = [P('a', 37.7, 126.73), P('b', 37.705, 126.735), P('c', 37.0, 127.1)];
		const far = clusterByDistance(pts, at(8), 8);
		expect(far.map((c) => c.items.map((i) => i.id))).toEqual([['a', 'b'], ['c']]);
		expect(clusterByDistance(pts, at(13), 13)).toHaveLength(3);
	});

	it('가장 가까운 묶음에 합치고 묶음 위치는 합칠 때마다 평균으로 옮긴다', () => {
		// 한 줄 위의 점 0, 30, 60px (반지름 40): b는 a에 붙고(위치 15), c는 15에서 45px이라 따로 선다
		const px: Record<string, number> = { a: 0, b: 30, c: 60 };
		const pts = [P('a', 0, 0), P('b', 0, 1), P('c', 0, 2)];
		const out = clusterByDistance(pts, (p) => ({ x: px[p.id], y: 0 }), 8);
		expect(out.map((c) => c.items.map((i) => i.id))).toEqual([['a', 'b'], ['c']]);
		// 첫 묶음 위치는 평균(a·b의 위·경도 평균)
		expect(out[0].lng).toBeCloseTo(0.5);
		expect(out[0].order).toBe(0);
		expect(out[1].order).toBe(2);
	});

	it('고른 단지는 가까워도 묶지 않고, 다른 단지도 그 곁에 붙지 않는다', () => {
		const pts = [P('a', 37.7, 126.73), P('b', 37.7005, 126.7305), P('c', 37.701, 126.731)];
		const out = clusterByDistance(pts, at(8), 8, { keepId: 'b' });
		const sizes = out.map((c) => [c.items.map((i) => i.id).join(), c.items.length]);
		expect(sizes).toEqual([
			['a,c', 2],
			['b', 1]
		]);
	});

	it('maxZoom 이상에서는 같은 위치(소수 4자리)만 묶는다', () => {
		const pts = [P('a', 37.70001, 126.73001), P('b', 37.70002, 126.73002), P('c', 37.7005, 126.73)];
		const z = clusterByDistance(pts, at(16), 16, { maxZoom: CLUSTER_MAX_ZOOM });
		expect(z.map((c) => c.items.length).sort()).toEqual([1, 2]);
	});

	it('묶음 위치는 평균, 경계는 최소·최대', () => {
		const [c] = clusterByDistance([P('a', 37, 127), P('b', 37.02, 127.02)], at(5), 5);
		expect(c.lat).toBeCloseTo(37.01);
		expect(c.lng).toBeCloseTo(127.01);
		expect(c.bounds).toEqual({ south: 37, west: 127, north: 37.02, east: 127.02 });
		expect(boundsOf([P('x', 1, 2)])).toEqual({ south: 1, west: 2, north: 1, east: 2 });
	});

	it('빈 입력은 빈 결과', () => {
		expect(clusterByDistance([], at(9), 9)).toEqual([]);
	});
});
