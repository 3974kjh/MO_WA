import { describe, expect, it } from 'vitest';
import { TIER_ORDER, type ComplexTier } from './points';
import { clusterZIndex, pinZIndex, Z_CLUSTER, Z_SELECTED, Z_TIER } from './markerZ';

describe('markerZIndex', () => {
	it('등급 띠는 점수 0–100을 더해도 옆 등급·묶음·선택과 겹치지 않는다', () => {
		const highs = TIER_ORDER.map((t) => pinZIndex(t, 100));
		const lows = TIER_ORDER.map((t) => pinZIndex(t, 0));
		const all = [...lows, ...highs, clusterZIndex(1), clusterZIndex(20), Z_SELECTED];
		expect(new Set(all).size).toBe(all.length);
		// 후보 100점 ≠ 일반 0점 (옛 공식 400+100 === 500)
		expect(pinZIndex('cand', 100)).not.toBe(pinZIndex('target', 0));
		// 최우선 100점 ≠ 묶음 기준 (옛 공식 600+100 === 700)
		expect(pinZIndex('top', 100)).toBeLessThan(Z_CLUSTER);
		expect(pinZIndex('top', 100)).toBeLessThan(clusterZIndex(0));
		expect(clusterZIndex(1)).toBeLessThan(Z_SELECTED);
		expect(pinZIndex('top', 80, true)).toBe(Z_SELECTED);
		expect(pinZIndex('ref', null, true)).toBe(Z_SELECTED);
	});

	it('같은 등급에서는 점수가 높은 핀이 위에 오고, 등급 순은 참고 < 후보 < 일반 < 최우선', () => {
		expect(pinZIndex('top', 90)).toBeGreaterThan(pinZIndex('top', 10));
		expect(pinZIndex('ref', 0)).toBe(Z_TIER.ref);
		const order: ComplexTier[] = ['ref', 'cand', 'target', 'top'];
		for (let i = 1; i < order.length; i++) {
			expect(pinZIndex(order[i], 0)).toBeGreaterThan(pinZIndex(order[i - 1], 100));
		}
	});
});
