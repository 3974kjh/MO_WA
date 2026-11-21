/**
 * Design schema contract for BE-03 (SQL migrations owned by BE-01).
 * display_id is always a server string (e.g. P-0412, R-0001).
 */

export type Uuid = string;
export type Timestamptz = string;
export type IsoDate = string;

export type ReportKind =
	| 'daily_brief'
	| 'weekly_report'
	| 'equity_analysis'
	| 'realestate_brief'
	| 'realestate_analysis'
	| 'strategy'
	| 'principles';

export type ReportRow = {
	id: Uuid;
	owner_id: Uuid;
	kind: ReportKind;
	subtype: 'buy_plan' | null;
	domain: 'macro' | 'stock' | 'realestate';
	slug: string;
	title: string;
	headline: string | null;
	report_date: IsoDate;
	period_start: IsoDate | null;
	period_end: IsoDate | null;
	summary: string | null;
	body_md: string;
	tags: string[];
	tickers: string[];
	meta: Record<string, unknown>;
	status: 'draft' | 'published';
	source_bot_id: Uuid | null;
	version: number;
	archived_at: Timestamptz | null;
	created_at: Timestamptz;
	updated_at: Timestamptz;
};

export type PositionRow = {
	id: Uuid;
	owner_id: Uuid;
	instrument_id: Uuid;
	status: 'holding' | 'planned' | 'closed';
	currency: 'KRW' | 'USD';
	qty: number | null;
	avg_price: number | null;
	trigger_price: number | null;
	trigger_direction: 'below' | 'above';
	watch_only: boolean;
	source_bot_id: Uuid | null;
	version: number;
	approval_version: number;
	archived_at: Timestamptz | null;
};

export type JournalEntryRow = {
	id: Uuid;
	owner_id: Uuid;
	entry_date: IsoDate;
	kind: 'buy' | 'sell' | 'thought' | 'plan' | 'review';
	state: 'pending' | 'done' | 'hold' | 'closed';
	instrument_id: Uuid | null;
	tickers: string[];
	title: string;
	price: number | null;
	qty: number | null;
	currency: 'KRW' | 'USD' | null;
	client_ref: string | null;
	source_bot_id: Uuid | null;
	archived_at: Timestamptz | null;
};

export type InstrumentRow = {
	id: Uuid;
	owner_id: Uuid;
	ticker: string;
	name: string;
	market: string;
	asset_type: 'stock' | 'etf' | 'bond' | 'cash';
	source_bot_id: Uuid | null;
	archived_at: Timestamptz | null;
};

export type PositionProposalRow = {
	id: Uuid;
	owner_id: Uuid;
	display_no: number;
	/** Server string from mowa_display_id — e.g. P-0412. Never invent client-side. */
	display_id: string;
	change_type: 'open_holding' | 'set_qty_avg' | 'close';
	calc_note: string | null;
	proposed_by_type: 'bot' | 'user';
	proposed_by: Uuid | null;
	status: string;
	source_bot_id: Uuid | null;
};

export type PrincipleProposalRow = {
	id: Uuid;
	owner_id: Uuid;
	display_no: number;
	/** Server string — e.g. R-0001. */
	display_id: string;
	proposed_by_type: 'bot' | 'user';
	status: string;
	source_bot_id: Uuid | null;
};
