/**
 * /dev/components 쇼케이스용 픽스처 (FE-02). design/components.html 샘플 값(2026-11-20 기록 참고)을 옮겼다.
 * 서비스 데이터가 아니다. BE-11 이후에도 쇼케이스에서만 쓴다.
 */
export interface HoldingRow extends Record<string, unknown> {
	name: string;
	code: string;
	qty: number;
	avg: number;
	price: number;
	pnlPct: number;
	weight: number;
}

export const holdings: HoldingRow[] = [
	{
		name: 'NAVER',
		code: '035420',
		qty: 27,
		avg: 210_000,
		price: 161_600,
		pnlPct: -23.0,
		weight: 18.1
	},
	{ name: 'KT', code: '030200', qty: 75, avg: 52_900, price: 45_500, pnlPct: -14.0, weight: 14.1 },
	{
		name: '예시 상승 종목',
		code: '000000 · 예시',
		qty: 10,
		avg: 10_000,
		price: 11_200,
		pnlPct: 12.0,
		weight: 2.0
	}
];

export interface ThemeRow extends Record<string, unknown> {
	kind: string;
	theme: string;
	basis: string;
	meaning: string;
}

export const themeRows: ThemeRow[] = [
	{
		kind: '신규·핵심',
		theme: '앤트로픽 상장',
		basis: '조달 813.4억 달러, 첫날 +17.07%',
		meaning: '기존 AI주에서 돈이 빠짐'
	},
	{ kind: '반복', theme: 'AI 과잉투자 우려', basis: '뉴스·리서치', meaning: '인프라 고점론 증거' }
];

/** 금액 표기 표: [원본 값, 통화·종류, 설명] */
export const moneyRows: {
	value: number;
	currency: 'KRW' | 'USD';
	kind: 'amount' | 'unit';
	note: string;
}[] = [
	{ value: 24_141_484, currency: 'KRW', kind: 'amount', note: '총 평가액' },
	{ value: -2_271_309, currency: 'KRW', kind: 'amount', note: '손익(음수)' },
	{ value: 360_000, currency: 'KRW', kind: 'amount', note: '하루 변동' },
	{ value: 97_590, currency: 'KRW', kind: 'amount', note: '10만 미만' },
	{ value: 9_759, currency: 'KRW', kind: 'amount', note: '1만 미만' },
	{ value: 1_820_115, currency: 'KRW', kind: 'amount', note: '만 단위' },
	{ value: 243_105_000, currency: 'KRW', kind: 'amount', note: '1억 이상' },
	{ value: 100_000_000, currency: 'KRW', kind: 'amount', note: '정확히 1억' },
	{ value: 272.66, currency: 'USD', kind: 'unit', note: '주가(달러)' },
	{ value: 1_820.115, currency: 'USD', kind: 'amount', note: '달러 금액 1만 미만' },
	{ value: 18_400, currency: 'USD', kind: 'amount', note: '달러 금액 1만 이상' }
];

export const briefingGroups = [
	{
		month: '2026-11',
		label: '2026년 11월',
		items: [
			{ date: '11/20', title: '코스피 −5.21% 급락, 10개월 만에 4,800선' },
			{ date: '11/19', title: 'headline 미입력' }
		]
	},
	{ month: '2026-10', label: '2026년 10월', items: [{ date: '10/31', title: '월말 점검' }] }
];
