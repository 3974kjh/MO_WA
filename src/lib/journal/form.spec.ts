import { describe, expect, it } from 'vitest';
import {
	emptyJournalForm,
	journalFormFromFormData,
	journalFormFromItem,
	marketCurrency,
	qtyStep,
	validateJournalForm,
	type JournalFormInput
} from './form';
import type { InstrumentOption } from './view';

const inst: InstrumentOption[] = [
	{ id: 'a', ticker: '000111', name: '가나', market: 'KRX', asset_type: 'stock', archived: false },
	{ id: 'b', ticker: 'QQQX', name: '라마', market: 'NASDAQ', asset_type: 'etf', archived: false },
	{ id: 'c', ticker: 'CASHK', name: '현금', market: 'CASH', asset_type: 'cash', archived: false }
];
const base = (over: Partial<JournalFormInput> = {}): JournalFormInput => ({
	...emptyJournalForm('2026-11-02'),
	title: '제목',
	...over
});
const fields = (r: ReturnType<typeof validateJournalForm>) =>
	r.ok ? [] : r.errors.map((e) => `${e.field}:${e.rule}`);

describe('FE-06 일지 폼 검사', () => {
	it.each(['buy', 'sell'])('%s는 종목·가격·수량·통화 필수(R-VAL-J02)', (kind) => {
		const r = validateJournalForm(base({ kind }), inst);
		expect(fields(r)).toEqual([
			'instrument_id:R-VAL-J02',
			'price:R-VAL-J02',
			'qty:R-VAL-J02',
			'currency:R-VAL-J02'
		]);
	});

	it('buy 통과: 종목 코드를 tickers[]에 넣는다', () => {
		const r = validateJournalForm(
			base({ kind: 'buy', instrument_id: 'a', price: '70,100', qty: '3', currency: 'KRW' }),
			inst
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.values).toMatchObject({ price: 70100, qty: 3, currency: 'KRW', tickers: ['000111'] });
		expect(r.warnings).toEqual([]);
	});

	it.each(['thought', 'review', 'plan'])('%s는 종목·가격 없이 통과', (kind) => {
		const r = validateJournalForm(base({ kind }), inst);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.values.instrument_id).toBeNull();
	});

	it('가격을 쓰면 통화 필요(R-VAL-J05), 0 이하는 오류', () => {
		expect(fields(validateJournalForm(base({ price: '10' }), inst))).toEqual([
			'currency:R-VAL-J05'
		]);
		expect(fields(validateJournalForm(base({ price: '0', currency: 'KRW' }), inst))).toEqual([
			'price:R-VAL-J05'
		]);
		expect(fields(validateJournalForm(base({ price: 'abc', currency: 'KRW' }), inst))).toEqual([
			'price:R-VAL-J05'
		]);
	});

	it('tickers[]는 instruments 코드만(R-VAL-C04), 중복 제거', () => {
		expect(fields(validateJournalForm(base({ tickers: ['NOPE'] }), inst))).toEqual([
			'tickers:R-VAL-C04'
		]);
		const r = validateJournalForm(base({ tickers: ['QQQX', 'QQQX', '000111'] }), inst);
		expect(r.ok && r.values.tickers).toEqual(['QQQX', '000111']);
	});

	it('수량 단위(R-VAL-M03): 주식·ETF 정수, 현금 소수 2자리', () => {
		const t = (instrument_id: string, qty: string) =>
			fields(
				validateJournalForm(
					base({ kind: 'buy', instrument_id, qty, price: '1', currency: 'KRW' }),
					inst
				)
			);
		expect(t('a', '1.5')).toEqual(['qty:R-VAL-M03']);
		expect(t('c', '1.234')).toEqual(['qty:R-VAL-M03']);
		expect(t('c', '1.23')).toEqual([]);
		expect(qtyStep('stock')).toBe('1');
		expect(qtyStep('cash')).toBe('0.01');
	});

	it('시장 통화와 다르면 주의만(R-VAL-M01, 저장은 됨)', () => {
		const r = validateJournalForm(
			base({ kind: 'buy', instrument_id: 'b', price: '8.7654', qty: '2', currency: 'KRW' }),
			inst
		);
		expect(r.ok).toBe(true);
		expect(r.warnings.map((w) => w.rule)).toEqual(['R-VAL-M01']);
		expect(marketCurrency('KRX')).toBe('KRW');
		expect(marketCurrency('NYSE')).toBe('USD');
		expect(marketCurrency('ETC')).toBeNull();
	});

	it('제목 1~200자, 날짜 형식, 출처 http(s)', () => {
		expect(fields(validateJournalForm(base({ title: '  ' }), inst))).toEqual(['title:R-VAL-S05']);
		expect(fields(validateJournalForm(base({ title: 'x'.repeat(201) }), inst))).toEqual([
			'title:R-VAL-S05'
		]);
		expect(fields(validateJournalForm(base({ entry_date: '2026-02-30' }), inst))).toEqual([
			'entry_date:R-VAL-T01'
		]);
		expect(fields(validateJournalForm(base({ source_url: 'javascript:x' }), inst))).toEqual([
			'source_url:R-VAL-S04'
		]);
	});

	it('없는 종목 id·이상한 리포트 id는 오류', () => {
		expect(fields(validateJournalForm(base({ instrument_id: 'zz' }), inst))).toEqual([
			'instrument_id:R-VAL-J03'
		]);
		expect(fields(validateJournalForm(base({ report_id: 'x' }), inst))).toEqual([
			'report_id:R-VAL-J04'
		]);
	});

	it('FormData → 입력(owner_id 같은 다른 키는 읽지 않음)', () => {
		const fd = new FormData();
		fd.set('title', 't');
		fd.set('owner_id', 'evil');
		fd.append('tickers', 'QQQX');
		fd.append('tickers', '000111');
		const v = journalFormFromFormData(fd);
		expect(v.tickers).toEqual(['QQQX', '000111']);
		expect('owner_id' in v).toBe(false);
	});

	it('수정 폼: 종목 코드는 연결 종목 칩에서 뺀다', () => {
		const v = journalFormFromItem({
			entry_date: '2026-11-01',
			kind: 'buy',
			state: 'done',
			title: 't',
			instrument_id: 'a',
			instrument_ticker: '000111',
			tickers: ['000111', 'QQQX'],
			price: 5,
			qty: 1,
			currency: 'KRW',
			memo_md: null,
			source_url: null,
			report_id: null
		});
		expect(v.tickers).toEqual(['QQQX']);
		expect(v.price).toBe('5');
	});
});
