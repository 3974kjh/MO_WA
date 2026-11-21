/**
 * /dev/components 차트 쇼케이스용 픽스처 (FE-14). design/shared/data.js 샘플 값을 옮겼다.
 * 서비스 데이터가 아니다. 실데이터(BE-10 price_snapshots·portfolio_snapshots)는 FE-03·FE-05에서 연결한다.
 */
export const kospiSeries: [string, number][] = [
	['10/16', 5668.05],
	['10/19', 5768.01],
	['10/20', 5552.74],
	['10/21', 5735.66],
	['10/28', 6012.44],
	['10/29', 5937.66],
	['10/30', 5730.74],
	['11/02', 5859.08],
	['11/03', 5648.79],
	['11/04', 5683.8],
	['11/05', 5383.8],
	['11/06', 5059.69],
	['11/09', 5018.85],
	['11/10', 5239.13],
	['11/11', 5375.36],
	['11/13', 5290.53],
	['11/16', 5100.5],
	['11/17', 4968.48],
	['11/18', 5067.44],
	['11/19', 5137.89],
	['11/20', 4869.96]
];

/** 일별 등락률(%) — kospiSeries에서 계산 */
export const kospiDaily: { label: string; value: number }[] = kospiSeries
	.slice(-10)
	.map(([label, v], i, arr) => {
		const prev = i === 0 ? kospiSeries[kospiSeries.length - 11][1] : arr[i - 1][1];
		return { label, value: Number((((v - prev) / prev) * 100).toFixed(2)) };
	});

/** 평균 단가 대비 손익(%) — 음수만 있는 예 */
export const pnlNegativeOnly: { label: string; value: number }[] = [
	{ label: 'NAVER', value: -23.0 },
	{ label: 'KT', value: -14.0 },
	{ label: '알파벳 A', value: -3.2 }
];

/** 자산 비중(%) */
export const weights: { label: string; value: number }[] = [
	{ label: '채권·IRP 등', value: 42.6 },
	{ label: 'NAVER', value: 18.07 },
	{ label: 'SGOV', value: 17.25 },
	{ label: 'KT', value: 14.14 },
	{ label: '알파벳 A', value: 7.54 },
	{ label: 'QBTS', value: 0.4 }
];

export const sparkUp = [1, 2, 2.5, 2.2, 3.4, 4];
export const sparkDown = [4, 3.6, 3.7, 2.8, 2, 1.4];
