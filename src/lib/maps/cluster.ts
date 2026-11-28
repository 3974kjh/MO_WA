/**
 * 거리 기반 클러스터(순수 함수, 외부 라이브러리 없음 — PLAN §3-4, 시안 v1.7.8 shared/realestate-map.js entities()).
 * 목록(우선) 순서로 훑으며 화면 픽셀 거리 radius 안의 가장 가까운 묶음에 합치고, 묶음 위치는 합칠 때마다
 * 평균으로 갱신한다. 고른 단지(keepId)는 절대 묶지 않는다. maxZoom 이상에서는 같은 위치(소수 4자리)만 묶는다.
 */
import { coordKey } from './points';

export interface GeoPoint {
	id: string;
	lat: number;
	lng: number;
}

export interface Bounds {
	south: number;
	west: number;
	north: number;
	east: number;
}

export interface Cluster<T extends GeoPoint> {
	key: string;
	items: T[];
	/** 묶음의 평균 위치(핀 자리) */
	lat: number;
	lng: number;
	bounds: Bounds;
	/** 입력(목록) 순서에서 가장 앞선 위치 — 키보드 순서·z-index 기준 */
	order: number;
}

/** 이 줌부터는 같은 위치(소수 4자리)만 묶는다(동네 단위가 보이는 정도) */
export const CLUSTER_MAX_ZOOM = 15;

/** 시안 CELL=[40,34,28]: 멀리 볼수록 넓게 묶는다. 줌 구간으로 환산(네이버 줌 레벨). */
export function clusterRadius(zoom: number): number {
	return zoom < 11 ? 40 : zoom < 13 ? 34 : 28;
}

/** 세계 픽셀 좌표(줌 z, 타일 256). */
export function worldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
	const scale = 256 * 2 ** zoom;
	const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
	return {
		x: ((lng + 180) / 360) * scale,
		y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale
	};
}

export function boundsOf(points: readonly GeoPoint[]): Bounds {
	let south = Infinity;
	let west = Infinity;
	let north = -Infinity;
	let east = -Infinity;
	for (const p of points) {
		south = Math.min(south, p.lat);
		north = Math.max(north, p.lat);
		west = Math.min(west, p.lng);
		east = Math.max(east, p.lng);
	}
	return { south, west, north, east };
}

export interface PixelPoint {
	x: number;
	y: number;
}

export function clusterByDistance<T extends GeoPoint>(
	points: readonly T[],
	project: (p: T) => PixelPoint,
	zoom: number,
	opts: { keepId?: string | null; maxZoom?: number } = {}
): Cluster<T>[] {
	const maxZoom = opts.maxZoom ?? CLUSTER_MAX_ZOOM;
	const r = clusterRadius(zoom);
	const exact = zoom >= maxZoom;
	interface G {
		items: T[];
		x: number;
		y: number;
		order: number;
		solo: boolean;
	}
	const groups: G[] = [];
	const byCoord = new Map<string, G>();
	points.forEach((p, order) => {
		const q = project(p);
		const solo = p.id === opts.keepId;
		let best: G | null = null;
		if (!solo) {
			if (exact) {
				const g = byCoord.get(coordKey(p.lat, p.lng));
				if (g && !g.solo) best = g;
			} else {
				let bd = r;
				for (const g of groups) {
					if (g.solo) continue;
					const d = Math.hypot(g.x - q.x, g.y - q.y);
					if (d < bd) {
						bd = d;
						best = g;
					}
				}
			}
		}
		if (best) {
			const n = best.items.length;
			best.x = (best.x * n + q.x) / (n + 1);
			best.y = (best.y * n + q.y) / (n + 1);
			best.items.push(p);
		} else {
			const g: G = { items: [p], x: q.x, y: q.y, order, solo };
			groups.push(g);
			if (!solo) byCoord.set(coordKey(p.lat, p.lng), g);
		}
	});
	return groups.map((g) => ({
		key: g.items.map((i) => i.id).join(','),
		items: g.items,
		lat: g.items.reduce((a, p) => a + p.lat, 0) / g.items.length,
		lng: g.items.reduce((a, p) => a + p.lng, 0) / g.items.length,
		bounds: boundsOf(g.items),
		order: g.order
	}));
}
