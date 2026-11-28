import { describe, expect, it } from 'vitest';
import {
	axisLeft,
	barDomain,
	barLabelVisible,
	barLabelStep,
	clampLabelX,
	compactNumber,
	barShape,
	barSummary,
	categoryColor,
	chartHeight,
	CHART_MOBILE_HEIGHT,
	donutSummary,
	groupDonut,
	lineSummary,
	lineTickMax,
	nearestIndex,
	bandIndex,
	signedNumber,
	sparkSummary,
	trendTone,
	xTickIndices
} from './layout';

describe('trendTone (스파크라인 색)', () => {
	it('끝이 시작보다 높으면 up(빨강), 낮으면 down(파랑), 같으면 flat', () => {
		expect(trendTone([1, 2, 2.5, 2.2, 3.4, 4])).toBe('up');
		expect(trendTone([4, 3.6, 3.7, 2.8, 2, 1.4])).toBe('down');
		expect(trendTone([3, 1, 5, 3])).toBe('flat');
	});
	it('중간 최고·최저가 아니라 시작·끝만 본다', () => {
		expect(trendTone([10, 1, 1, 11])).toBe('up');
		expect(trendTone([10, 50, 60, 9])).toBe('down');
	});
	it('값이 1개 이하이거나 NaN만 있으면 flat', () => {
		expect(trendTone([])).toBe('flat');
		expect(trendTone([5])).toBe('flat');
		expect(trendTone([NaN, 1, NaN, 3])).toBe('up');
	});
	it('요약 문장에 등락 단어가 붙는다', () => {
		expect(sparkSummary('코스피 8일 추이', [5, 4])).toBe('코스피 8일 추이, 하락');
	});
});

describe('chartHeight · 눈금 (모바일 <480)', () => {
	it('<480이면 190, 그 밖에는 지정값·기본값', () => {
		expect(chartHeight(479, 300, 260)).toBe(CHART_MOBILE_HEIGHT);
		expect(chartHeight(480, undefined, 260)).toBe(260);
		expect(chartHeight(800, 300, 260)).toBe(300);
	});
	it('선 차트 X축 눈금은 모바일 4개, PC 8개 이내이고 처음·마지막을 포함', () => {
		expect(lineTickMax(360)).toBe(4);
		expect(lineTickMax(720)).toBe(8);
		for (let n = 1; n <= 120; n++) {
			for (const max of [4, 5, 8, 12]) {
				const t = xTickIndices(n, max);
				expect(t.length).toBeLessThanOrEqual(max);
				expect(t[0]).toBe(0);
				expect(t[t.length - 1]).toBe(n - 1);
				expect(new Set(t).size).toBe(t.length);
				for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
			}
		}
	});
	it('마지막 눈금과 겹치는 중간 눈금은 뺀다', () => {
		// 21개(시안 코스피) 모바일: 0,7,14,20 — 14와 20 간격이 충분
		expect(xTickIndices(21, 4)).toEqual([0, 7, 14, 20]);
		const t = xTickIndices(12, 4);
		const step = Math.ceil(11 / 3);
		expect(11 - t[t.length - 2]).toBeGreaterThanOrEqual(step * 0.6);
	});
	it('n이 0이면 빈 배열', () => {
		expect(xTickIndices(0, 4)).toEqual([]);
	});
});

describe('barDomain (막대 축)', () => {
	it('항상 0을 포함한다', () => {
		const [lo, hi] = barDomain([1.2, -3.4, 2]);
		expect(lo).toBeLessThan(-3.4);
		expect(hi).toBeGreaterThan(2);
	});
	it('음수만 있으면 위 끝이 0(0선이 위)이고 아래만 여유', () => {
		const [lo, hi] = barDomain([-1, -5.21, -2]);
		expect(hi).toBe(0);
		expect(lo).toBeLessThan(-5.21);
	});
	it('양수만 있으면 아래 끝이 0', () => {
		const [lo, hi] = barDomain([1, 3]);
		expect(lo).toBe(0);
		expect(hi).toBeGreaterThan(3);
	});
	it('모두 0이거나 비어도 0이 아닌 범위', () => {
		const [lo, hi] = barDomain([0, 0]);
		expect(hi - lo).toBeGreaterThan(0);
		expect(barDomain([])).toEqual([0, 1]);
	});
});

describe('barLabelVisible (값 라벨)', () => {
	it('PC는 14개 이하면 모두 보인다', () => {
		for (let i = 0; i < 14; i++) expect(barLabelVisible(i, 14, false)).toBe(true);
	});
	it('모바일은 5개 간격 + 마지막', () => {
		const shown = Array.from({ length: 12 }, (_, i) => i).filter((i) =>
			barLabelVisible(i, 12, true)
		);
		expect(shown).toEqual([0, 5, 10, 11]);
	});
});

describe('compactNumber · 라벨 간격 (큰 수 막대, M1)', () => {
	it('만/억/조로 줄이고 10 미만만 소수 1자리', () => {
		expect(compactNumber(123_456_789_012)).toBe('+1,235억');
		expect(compactNumber(-350_000_000)).toBe('−3.5억');
		expect(compactNumber(1_200_000_000_000)).toBe('+1.2조');
		expect(compactNumber(-52_000)).toBe('−5.2만');
		expect(compactNumber(812)).toBe('+812');
		expect(compactNumber(0)).toBe('0');
		expect(compactNumber(Number.NaN)).toBe('—');
	});
	it('라벨이 칸보다 넓으면 몇 칸마다 하나', () => {
		expect(barLabelStep(30, 40)).toBe(1);
		expect(barLabelStep(42, 20)).toBe(3);
		expect(barLabelStep(10, 0)).toBe(Number.POSITIVE_INFINITY);
	});
	it('끝 라벨은 플롯 안쪽으로 당긴다', () => {
		expect(clampLabelX(395, 40, 50, 400)).toBe(380);
		expect(clampLabelX(52, 40, 50, 400)).toBe(70);
		expect(clampLabelX(200, 40, 50, 400)).toBe(200);
		expect(clampLabelX(60, 40, 50, 80)).toBe(65);
	});
});

describe('groupDonut (도넛 조각)', () => {
	const weights = [
		{ label: '채권·IRP 등', value: 42.6 },
		{ label: 'NAVER', value: 18.07 },
		{ label: 'SGOV', value: 17.25 },
		{ label: 'KT', value: 14.14 },
		{ label: '알파벳 A', value: 7.54 },
		{ label: 'QBTS', value: 0.4 }
	];
	it('6% 미만은 기타로 묶고 기타는 맨 뒤', () => {
		const s = groupDonut(weights);
		expect(s.map((x) => x.label)).toEqual([
			'채권·IRP 등',
			'NAVER',
			'SGOV',
			'KT',
			'알파벳 A',
			'기타'
		]);
		expect(s[5].members).toEqual(['QBTS']);
		expect(s.reduce((a, b) => a + b.pct, 0)).toBeCloseTo(100, 6);
	});
	it('8조각을 넘으면 기타 포함 8조각으로 맞춘다', () => {
		const many = Array.from({ length: 11 }, (_, i) => ({ label: `S${i}`, value: 9 + i }));
		const s = groupDonut(many);
		expect(s.length).toBe(8);
		expect(s[7].label).toBe('기타');
		expect(s[7].members?.length).toBe(4);
		expect(s.slice(0, 7).every((x) => x.pct >= 6)).toBe(true);
	});
	it('정확히 8조각이고 작은 것이 없으면 그대로', () => {
		const eight = Array.from({ length: 8 }, (_, i) => ({ label: `S${i}`, value: 10 + i }));
		const s = groupDonut(eight);
		expect(s.length).toBe(8);
		expect(s.some((x) => x.label === '기타')).toBe(false);
	});
	it('색은 chart-1~8만 쓰고 up/down 색을 쓰지 않는다', () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ label: `S${i}`, value: 1 + i }));
		for (const x of groupDonut(many)) {
			expect(x.color).toMatch(/^var\(--color-chart-[1-8]\)$/);
		}
		expect(categoryColor(8)).toBe('var(--color-chart-1)');
	});
	it('0·음수·NaN은 빼고, 다 빠지면 빈 배열', () => {
		expect(groupDonut([{ label: 'a', value: 0 }])).toEqual([]);
		expect(
			groupDonut([
				{ label: 'a', value: NaN },
				{ label: 'b', value: 5 }
			]).map((x) => x.label)
		).toEqual(['b']);
	});
	it('요약 문장: 큰 3개 + 나머지 개수', () => {
		expect(donutSummary('자산 비중', groupDonut(weights))).toBe(
			'자산 비중. 채권·IRP 등 42.6%, NAVER 18.1%, SGOV 17.3% 외 3개'
		);
	});
});

describe('요약 aria-label', () => {
	it('선: 시작→끝, 등락, 최고·최저', () => {
		const s = lineSummary(
			'코스피',
			[{ name: '코스피', values: [5668.05, 6012.44, 4869.96] }],
			['10/16', '10/28', '11/20'],
			(v) => v.toFixed(0)
		);
		expect(s).toBe('코스피. 코스피 10/16~11/20 5668에서 4870(하락), 최고 6012 최저 4870');
	});
	it('막대: 상승·하락 개수와 최대·최소', () => {
		const s = barSummary(
			'일별 등락률',
			[
				{ label: '11/18', value: 2 },
				{ label: '11/19', value: 1.4 },
				{ label: '11/20', value: -5.21 }
			],
			(v) => signedNumber(v, 2) + '%'
		);
		expect(s).toBe(
			'일별 등락률. 3개 중 상승 2개, 하락 1개. 가장 높음 11/18 +2.00%, 가장 낮음 11/20 −5.21%'
		);
	});
	it('데이터가 없으면 그렇게 말한다', () => {
		expect(barSummary('x', [], String)).toBe('x. 데이터 없음');
		expect(lineSummary('x', [], [], String)).toBe('x. 데이터 없음');
	});
});

describe('signedNumber · 포인터 인덱스', () => {
	it('유니코드 마이너스, 0은 부호 없음', () => {
		expect(signedNumber(1.39, 1)).toBe('+1.4');
		expect(signedNumber(-5.21, 1)).toBe('\u22125.2');
		expect(signedNumber(-0.01, 1)).toBe('0.0');
	});
	it('nearestIndex·bandIndex는 범위 안으로 자른다', () => {
		expect(nearestIndex(-100, 50, 500, 10)).toBe(0);
		expect(nearestIndex(9999, 50, 500, 10)).toBe(9);
		expect(nearestIndex(300, 50, 500, 11)).toBe(5);
		expect(bandIndex(50 + 499, 50, 500, 10)).toBe(9);
		expect(bandIndex(50, 50, 500, 10)).toBe(0);
	});
});

describe('barShape (BarChart Low-2)', () => {
	const y = (v: number) => 100 - v * 2;
	const y0 = 100;
	it.each([NaN, Infinity, -Infinity])('비유한 값 %s는 null(rect 생략)', (v) => {
		expect(barShape(v, y, y0)).toBeNull();
	});
	it('유한 0은 up 1px 막대', () => {
		expect(barShape(0, y, y0)).toEqual({ up: true, y: 100, h: 1, ly: 96 });
	});
	it('양수·음수 유한 값', () => {
		expect(barShape(10, y, y0)).toEqual({ up: true, y: 80, h: 20, ly: 76 });
		expect(barShape(-10, y, y0)).toEqual({ up: false, y: 100, h: 20, ly: 132 });
	});
	it('items.map으로 쓰면 길이·인덱스가 유지된다', () => {
		const shapes = [1, NaN, -2, Infinity, 0].map((v) => barShape(v, y, y0));
		expect(shapes).toHaveLength(5);
		expect(shapes.map((s) => s === null)).toEqual([false, true, false, true, false]);
	});
});

describe('axisLeft (y축 라벨 안 잘림)', () => {
	it('짧은 라벨은 최소 여백, 긴 라벨은 폭 + 10', () => {
		expect(axisLeft(['0', '10'], 44)).toBe(44);
		expect(axisLeft(['254,880', '−35,209'], 44)).toBe(Math.ceil(7 * 6.6) + 10);
		expect(axisLeft([], 54)).toBe(54);
	});
});
