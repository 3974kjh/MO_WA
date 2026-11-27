import { describe, expect, it } from 'vitest';
import { toastBottomOffset } from './toastLift';

const gap = 12;
const barGap = 8;

describe('toastBottomOffset (DS §7-0: 시트 실제 윗선 기준)', () => {
	it('390 바닥 시트와 겹치면 시트 윗선 위 12px로 올린다(86dvh를 쓰지 않음)', () => {
		// 실측(v171): vh 844, 시트 top 326, 토스트 기본 바닥 ~80, 높이 48 → 기본 위치는 시트를 가림
		const sheet = { top: 326, right: 390, bottom: 844, left: 0 };
		const bottom = toastBottomOffset({
			sheet,
			viewportH: 844,
			viewportW: 390,
			toastH: 48,
			toastW: 358,
			defaultBottom: 80,
			barBottom: 56
		});
		expect(bottom).toBe(844 - 326 + gap); // 530
		// 올린 토스트의 아랫선 = 시트 윗선 - 12
		expect(844 - bottom!).toBe(326 - gap);
		// 86dvh(726) + 12 같은 잘못된 기준이 아님
		expect(bottom).not.toBe(726 + 12);
	});

	it('자리가 없으면(시트가 상단바 바로 아래까지) 상단바 바로 아래에 둔다', () => {
		const barBottom = 56;
		const sheet = { top: 64, right: 390, bottom: 844, left: 0 };
		const bottom = toastBottomOffset({
			sheet,
			viewportH: 844,
			viewportW: 390,
			toastH: 48,
			toastW: 358,
			defaultBottom: 80,
			barBottom
		});
		// 토스트 윗선 = 상단바 아래 8
		expect(844 - bottom! - 48).toBe(barBottom + barGap);
		expect(bottom).toBe(844 - (barBottom + barGap) - 48);
	});

	it('768 가운데 모달처럼 토스트가 시트 아래에 따로 있으면 위치를 바꾸지 않는다', () => {
		const sheet = { top: 227, right: 644, bottom: 673, left: 124 };
		const bottom = toastBottomOffset({
			sheet,
			viewportH: 900,
			viewportW: 768,
			toastH: 48,
			toastW: 420,
			defaultBottom: 24,
			barBottom: 56
		});
		expect(bottom).toBeNull();
	});

	it('시트가 닫혀 있어 화면 밖에 있으면 올리지 않는다', () => {
		const sheet = { top: 900, right: 390, bottom: 1400, left: 0 };
		expect(
			toastBottomOffset({
				sheet,
				viewportH: 844,
				viewportW: 390,
				toastH: 48,
				toastW: 358,
				defaultBottom: 80,
				barBottom: 56
			})
		).toBeNull();
	});
});
