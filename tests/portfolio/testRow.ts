/**
 * 테스트 전용 PortfolioRow 빌더. 화면 코드에서 import하지 않는다.
 * 값은 시안 샘플과 겹치지 않는 임의 숫자다.
 */
import type { PortfolioRow } from '$lib/portfolio/view';

export function makeRow(over: Partial<PortfolioRow> = {}): PortfolioRow {
	return {
		id: 'row-1',
		instrument_id: 'ins-1',
		name: '테스트종목',
		ticker: '000111',
		status: 'holding',
		currency: 'KRW',
		qty: 3,
		avg_price: 1000,
		trigger_price: null,
		trigger_direction: 'below',
		watch_only: false,
		price: 1100,
		price_as_of: '2026-11-20',
		value_krw: 3300,
		asset_type: 'stock',
		market: 'KRX',
		breakeven: null,
		memo: null,
		price_currency: 'KRW',
		open_status: null,
		...over
	};
}
