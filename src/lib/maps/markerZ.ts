/**
 * 지도 핀·묶음 마커 zIndex(SDK Marker.zIndex).
 * 등급 띠는 1000 단위라 점수(0–100)를 더해도 옆 등급과 겹치지 않는다.
 * 묶음은 모든 비선택 핀 위, 고른 핀은 묶음보다 위(카드가 가려지지 않게 하는 쌓임은 CSS 쪽).
 */
import type { ComplexTier } from './points';

export const Z_BAND = 1000;
export const Z_TIER: Record<ComplexTier, number> = {
	ref: 1 * Z_BAND,
	cand: 2 * Z_BAND,
	target: 3 * Z_BAND,
	top: 4 * Z_BAND
};
/** 묶음 기준값. 최우선 100점(4000+100)보다 위에 둔다 */
export const Z_CLUSTER = 5 * Z_BAND;
/** 고른 핀. 묶음(5000+n)보다 위 */
export const Z_SELECTED = 6 * Z_BAND;

function scorePart(score: number | null | undefined): number {
	if (score == null || !Number.isFinite(score)) return 0;
	return Math.max(0, Math.min(999, score));
}

/** 핀 zIndex. 고른 핀은 등급과 관계없이 Z_SELECTED. */
export function pinZIndex(
	tier: ComplexTier,
	score: number | null | undefined,
	selected = false
): number {
	if (selected) return Z_SELECTED;
	return Z_TIER[tier] + scorePart(score);
}

/** 묶음 zIndex. 개수를 더해 큰 묶음이 작은 묶음 위에 온다. */
export function clusterZIndex(count: number): number {
	return Z_CLUSTER + Math.max(0, count);
}
