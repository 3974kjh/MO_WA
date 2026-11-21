/**
 * R-VAL domain rules — design §3-4, rules.md §4.
 * Each rule: `{ id, level, check }` with modes `strict` | `migration`.
 *
 * ## Call boundary (M-5)
 * `runRules` belongs to MCP tools (BE-06+) and web form/RPC paths — **not** repo
 * create/update. Mode: general API keys use `strict`; `import:all` uses `migration`.
 *
 * ## Level boundary (L7)
 * A rule whose declared `level` is WARN may still emit ERROR for hard violations
 * of the same ID (e.g. R-VAL-R12 newline/>120, R-VAL-P09 newline/>200, R-VAL-R04
 * >3 lines). WARN is the soft/advisory default; ERROR is for CHECK-aligned rejects.
 */
import {
	CALC_NOTE_MAX_LEN,
	calcNoteSchema,
	candidatesMetaSchema,
	charLength,
	equityAnalysisContextSchema,
	equityContextKeySet,
	HEADLINE_ERROR_LEN,
	HEADLINE_WARN_LEN,
	headlineSchema,
	parseQty,
	SUMMARY_LINE_WARN_LEN,
	SUMMARY_MAX_LINES,
	summaryLineCharLength,
	summaryLines,
	summarySchema,
	tagsContainingTickerCodes,
	type AssetType,
	type PositionStatus,
	type ProposedByType,
	type ProposalChangeType
} from '$lib/schemas';
import type { ValidationIssue, ValidationMode, ValidationResult, ValidationRule } from './types';

function issue(
	id: string,
	level: ValidationIssue['level'],
	message: string
): ValidationIssue {
	return { id, level, message };
}

function asArray(v: ValidationIssue | ValidationIssue[] | null): ValidationIssue[] {
	if (v == null) return [];
	return Array.isArray(v) ? v : [v];
}

export function runRules<T>(
	rules: ValidationRule<T>[],
	input: T,
	mode: ValidationMode = 'strict'
): ValidationResult {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];
	for (const rule of rules) {
		for (const finding of asArray(rule.check(input, mode))) {
			if (finding.level === 'ERROR') errors.push(finding);
			else warnings.push(finding);
		}
	}
	return { ok: errors.length === 0, errors, warnings };
}

// ——— R-VAL-R12 ———
// Declared WARN (advisory >80); may emit ERROR for newline / >120 / empty string (L7).
export type HeadlineInput = { headline?: string | null };

export const ruleR12: ValidationRule<HeadlineInput> = {
	id: 'R-VAL-R12',
	level: 'WARN',
	check(input) {
		const h = input.headline;
		if (h == null) return null;
		// L2: empty string fails DB char_length >= 1
		if (h === '') {
			return issue('R-VAL-R12', 'ERROR', 'headline must be 1–120 chars');
		}
		const len = charLength(h);
		if (/[\r\n]/.test(h) || len > HEADLINE_ERROR_LEN || len < 1) {
			const parsed = headlineSchema.safeParse(h);
			return issue(
				'R-VAL-R12',
				'ERROR',
				parsed.success
					? 'headline must be 1–120 chars without newlines'
					: (parsed.error.issues[0]?.message ?? '[R-VAL-R12] invalid headline')
			);
		}
		if (len > HEADLINE_WARN_LEN) {
			return issue('R-VAL-R12', 'WARN', 'headline exceeds 80 characters');
		}
		return null;
	}
};

// ——— R-VAL-R04 ———
// Declared WARN (line length); may emit ERROR for >3 lines (L7).
export type SummaryInput = { summary?: string | null };

export const ruleR04: ValidationRule<SummaryInput> = {
	id: 'R-VAL-R04',
	level: 'WARN',
	check(input) {
		const s = input.summary;
		if (s == null || s === '') return null;
		const lines = summaryLines(s);
		const out: ValidationIssue[] = [];
		if (lines.length > SUMMARY_MAX_LINES || !summarySchema.safeParse(s).success) {
			if (lines.length > SUMMARY_MAX_LINES) {
				out.push(issue('R-VAL-R04', 'ERROR', 'summary must be 1–3 lines'));
			}
		}
		for (const line of lines) {
			if (summaryLineCharLength(line) > SUMMARY_LINE_WARN_LEN) {
				out.push(issue('R-VAL-R04', 'WARN', 'summary line exceeds 120 characters'));
				break;
			}
		}
		return out.length ? out : null;
	}
};

// ——— R-VAL-P09 ———
// Declared WARN (missing calc_note for bot); may emit ERROR for format (L7).
export type CalcNoteInput = {
	calc_note?: string | null;
	change_type: ProposalChangeType;
	proposed_by_type: ProposedByType;
};

export const ruleP09: ValidationRule<CalcNoteInput> = {
	id: 'R-VAL-P09',
	level: 'WARN',
	check(input) {
		const note = input.calc_note;
		if (note != null && note !== '') {
			if (/[\r\n]/.test(note) || charLength(note) > CALC_NOTE_MAX_LEN) {
				const parsed = calcNoteSchema.safeParse(note);
				return issue(
					'R-VAL-P09',
					'ERROR',
					parsed.success
						? 'calc_note must be one line ≤200 chars'
						: (parsed.error.issues[0]?.message ?? '[R-VAL-P09] invalid calc_note')
				);
			}
			return null;
		}
		if (
			input.proposed_by_type === 'bot' &&
			(input.change_type === 'open_holding' || input.change_type === 'set_qty_avg')
		) {
			return issue('R-VAL-P09', 'WARN', 'bot open_holding/set_qty_avg missing calc_note');
		}
		return null;
	}
};

// ——— R-VAL-M03 ———
export type QtyInput = {
	qty: number | null | undefined;
	asset_type: AssetType;
	status?: PositionStatus;
};

export const ruleM03: ValidationRule<QtyInput> = {
	id: 'R-VAL-M03',
	level: 'ERROR',
	check(input) {
		const parsed = parseQty(input.asset_type, input.qty, input.status);
		if (parsed.success) return null;
		return issue('R-VAL-M03', 'ERROR', parsed.message);
	}
};

// ——— R-VAL-R13 ———
export type R13Input = {
	kind: string;
	profile?: string | null;
	meta?: Record<string, unknown> | null;
	body_md?: string | null;
};

export const ruleR13: ValidationRule<R13Input> = {
	id: 'R-VAL-R13',
	level: 'WARN',
	check(input) {
		const isFm =
			input.profile === 'finance-manager' || input.profile === 'finance-manager-boot';
		if (!isFm || input.kind !== 'equity_analysis') return null;
		const meta = input.meta ?? {};
		const hasMetaTarget = meta.target_price != null || meta.opinion != null;
		const body = input.body_md ?? '';
		// L4: do not match bare English "opinion" in ordinary sentences.
		const hasBodyTarget = /목표가|투자의견|target[_\s-]?price/i.test(body);
		if (hasMetaTarget || hasBodyTarget) {
			return issue(
				'R-VAL-R13',
				'WARN',
				'finance-manager equity_analysis target/opinion is not official targets_valuation'
			);
		}
		return null;
	}
};

// ——— R-VAL-R14 ———
export type R14Input = { meta?: { candidates?: unknown } | null };

export const ruleR14: ValidationRule<R14Input> = {
	id: 'R-VAL-R14',
	level: 'ERROR',
	check(input) {
		const candidates = input.meta?.candidates;
		if (candidates == null) return null;
		const parsed = candidatesMetaSchema.safeParse({ candidates });
		if (parsed.success) return null;
		return issue(
			'R-VAL-R14',
			'ERROR',
			parsed.error.issues[0]?.message ??
				'[R-VAL-R14] meta.candidates[] keys must be rank,ticker,close,l1,l2,stop,confidence,reason'
		);
	}
};

// ——— R-VAL-R15 (Q-20 context keys only — not buy_plan meta) ———
export type R15Input = {
	kind: string;
	meta?: Record<string, unknown> | null;
};

export const ruleR15: ValidationRule<R15Input> = {
	id: 'R-VAL-R15',
	level: 'ERROR',
	check(input) {
		const meta = input.meta;
		if (!meta) return null;
		const usedContextKeys = Object.keys(meta).filter((k) => equityContextKeySet.has(k));
		if (input.kind !== 'equity_analysis') {
			if (usedContextKeys.length > 0) {
				return issue(
					'R-VAL-R15',
					'ERROR',
					'equity_analysis context keys are forbidden on non-equity_analysis kinds'
				);
			}
			return null;
		}
		if (usedContextKeys.length === 0 && meta.alignment == null) return null;
		const parsed = equityAnalysisContextSchema.safeParse(
			Object.fromEntries(
				[...equityContextKeySet].map((k) => [k, meta[k]]).filter(([, v]) => v !== undefined)
			)
		);
		if (!parsed.success) {
			return issue(
				'R-VAL-R15',
				'ERROR',
				parsed.error.issues[0]?.message ??
					'[R-VAL-R15] invalid equity_analysis context / alignment'
			);
		}
		if (meta.alignment != null) {
			const ok = ['aligned', 'partial', 'conflict', 'unchecked'].includes(
				String(meta.alignment)
			);
			if (!ok) {
				return issue('R-VAL-R15', 'ERROR', 'alignment must be aligned|partial|conflict|unchecked');
			}
		}
		return null;
	}
};

// ——— R-VAL-J08 ———
export type J08Input = {
	tags?: string[] | null;
	/** Instrument tickers for this owner — required to avoid AI/ETF/IPO false positives (L3). */
	knownTickers?: string[] | null;
};

export const ruleJ08: ValidationRule<J08Input> = {
	id: 'R-VAL-J08',
	level: 'WARN',
	check(input) {
		const hits = tagsContainingTickerCodes(input.tags, input.knownTickers);
		if (hits.length === 0) return null;
		return issue(
			'R-VAL-J08',
			'WARN',
			`tags must not contain ticker codes: ${hits.join(', ')}`
		);
	}
};

/**
 * R-VAL-J02 — buy/sell require instrument_id, price, qty, currency.
 * L5: instrument is required only for buy/sell (Q-16); never for plan/thought/review.
 * strict → ERROR; migration → WARN (importer). DB CHECKs J03/J05 are not loosened:
 * use `shouldHoldJournalForDbChecks` and do not insert rows that would fail them.
 */
export type J02Input = {
	kind: string;
	instrument_id?: string | null;
	price?: number | null;
	qty?: number | null;
	currency?: string | null;
};

export const ruleJ02: ValidationRule<J02Input> = {
	id: 'R-VAL-J02',
	level: 'ERROR',
	check(input, mode) {
		if (input.kind !== 'buy' && input.kind !== 'sell') return null;
		const missing =
			!input.instrument_id ||
			input.price == null ||
			input.qty == null ||
			!input.currency;
		if (!missing) return null;
		const level = mode === 'migration' ? 'WARN' : 'ERROR';
		return issue(
			'R-VAL-J02',
			level,
			'buy/sell requires instrument_id, price, qty, currency'
		);
	}
};

/**
 * L5: Even in migration WARN mode, if a row would fail DB CHECK J03
 * (`journal_trade_needs_instrument`) or J05 (`journal_price_needs_currency`),
 * do not insert — hold it. Domain WARN does not loosen CHECKs.
 */
export function shouldHoldJournalForDbChecks(input: J02Input): boolean {
	if (input.kind === 'buy' || input.kind === 'sell') {
		if (!input.instrument_id) return true; // J03
	}
	if (input.price != null && !input.currency) return true; // J05
	return false;
}

/**
 * M-1: buy_plan meta stub until Q-33 — always null (no check).
 * Must not use R-VAL-R15 (that ID is Q-20 equity_analysis context only).
 */
export function validateBuyPlanMeta(meta: unknown): null {
	void meta; // Q-33 stub: intentionally ignore until keys are designed
	return null;
}

export const domainRules = {
	'R-VAL-R12': ruleR12,
	'R-VAL-R04': ruleR04,
	'R-VAL-P09': ruleP09,
	'R-VAL-M03': ruleM03,
	'R-VAL-R13': ruleR13,
	'R-VAL-R14': ruleR14,
	'R-VAL-R15': ruleR15,
	'R-VAL-J08': ruleJ08,
	'R-VAL-J02': ruleJ02
} as const;

export type DomainRuleId = keyof typeof domainRules;
