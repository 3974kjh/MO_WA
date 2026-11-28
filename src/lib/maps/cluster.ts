/**
 * 줌별 격자 클러스터(순수 함수, 외부 라이브러리 없음 — PLAN §3-4).
 * 웹 메르카토르 세계 픽셀 좌표(256 타일)를 줌마다 계산해 cellPx 칸으로 묶는다.
 * maxZoom 이상에서는 묶지 않고, 같은 위치(소수 4자리)만 한 핀으로 둔다.
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
}

export const CLUSTER_CELL_PX = 56;
/** 이 줌부터는 묶지 않는다(동네 단위가 보이는 정도) */
export const CLUSTER_MAX_ZOOM = 14;

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

export function clusterPoints<T extends GeoPoint>(
	points: readonly T[],
	zoom: number,
	opts: { cellPx?: number; maxZoom?: number } = {}
): Cluster<T>[] {
	const cell = opts.cellPx ?? CLUSTER_CELL_PX;
	const maxZoom = opts.maxZoom ?? CLUSTER_MAX_ZOOM;
	const groups = new Map<string, T[]>();
	for (const p of points) {
		let key: string;
		if (zoom >= maxZoom) {
			key = coordKey(p.lat, p.lng);
		} else {
			const w = worldPixel(p.lat, p.lng, zoom);
			key = `${Math.floor(w.x / cell)}:${Math.floor(w.y / cell)}`;
		}
		const g = groups.get(key);
		if (g) g.push(p);
		else groups.set(key, [p]);
	}
	return [...groups.entries()].map(([key, items]) => ({
		key,
		items,
		lat: items.reduce((a, p) => a + p.lat, 0) / items.length,
		lng: items.reduce((a, p) => a + p.lng, 0) / items.length,
		bounds: boundsOf(items)
	}));
}
