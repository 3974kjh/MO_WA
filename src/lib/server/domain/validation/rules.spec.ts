import { describe, expect, it } from 'vitest';
import type { ValidationIssue } from './types';
import {
	ruleJ02,
	ruleJ08,
	ruleM03,
	ruleP09,
	ruleR04,
	ruleR12,
	ruleR13,
	ruleR14,
	ruleR15,
	runRules,
	shouldHoldJournalForDbChecks,
	validateBuyPlanMeta
} from './rules';

function first<T>(
	rule: {
		check: (
			input: T,
			mode: 'strict' | 'migration'
		) => ValidationIssue | ValidationIssue[] | null;
	},
	input: T,
	mode: 'strict' | 'migration' = 'strict'
) {
	const result = rule.check(input, mode);
	if (result == null) return null;
	return Array.isArray(result) ? result[0] : result;
}

describe('domain validation rules', () => {
	it('R-VAL-R12', () => {
		expect(first(ruleR12, { headline: 'ok short' })).toBeNull();
		// L7: WARN rule may emit ERROR for hard violations
		expect(first(ruleR12, { headline: '' })?.level).toBe('ERROR');
		const warn = first(ruleR12, { headline: 'x'.repeat(81) });
		expect(warn?.level).toBe('WARN');
		expect(warn?.id).toBe('R-VAL-R12');
		expect(first(ruleR12, { headline: 'x'.repeat(121) })?.level).toBe('ERROR');
		expect(first(ruleR12, { headline: 'line1\nline2' })?.level).toBe('ERROR');
	});

	it('R-VAL-R04', () => {
		expect(first(ruleR04, { summary: 'one line' })).toBeNull();
		const warn = ruleR04.check({ summary: 'y'.repeat(121) }, 'strict');
		const issues = Array.isArray(warn) ? warn : warn ? [warn] : [];
		expect(issues.some((i) => i.level === 'WARN')).toBe(true);
		expect(issues[0]?.id).toBe('R-VAL-R04');
		// L7: >3 lines is ERROR from a WARN-declared rule
		expect(first(ruleR04, { summary: 'a\nb\nc\nd' })?.level).toBe('ERROR');
	});

	it('R-VAL-P09', () => {
		expect(
			first(ruleP09, {
				calc_note: 'avg = (q1*p1+q2*p2)/(q1+q2)',
				change_type: 'set_qty_avg',
				proposed_by_type: 'bot'
			})
		).toBeNull();

		const botWarn = first(ruleP09, {
			calc_note: null,
			change_type: 'open_holding',
			proposed_by_type: 'bot'
		});
		expect(botWarn?.level).toBe('WARN');
		expect(botWarn?.id).toBe('R-VAL-P09');

		expect(
			first(ruleP09, {
				calc_note: null,
				change_type: 'set_qty_avg',
				proposed_by_type: 'user'
			})
		).toBeNull();

		expect(
			first(ruleP09, {
				calc_note: 'a\nb',
				change_type: 'close',
				proposed_by_type: 'bot'
			})?.level
		).toBe('ERROR');
	});

	it('R-VAL-M03', () => {
		expect(first(ruleM03, { qty: 10, asset_type: 'stock', status: 'holding' })).toBeNull();
		expect(first(ruleM03, { qty: 1.5, asset_type: 'stock' })?.level).toBe('ERROR');
		expect(first(ruleM03, { qty: 1000.5, asset_type: 'cash' })).toBeNull();
		expect(first(ruleM03, { qty: 1000.505, asset_type: 'cash' })?.level).toBe('ERROR');
		// status omitted: cash 0 matches DB (no ERROR from repo/validation hard-fail)
		expect(first(ruleM03, { qty: 0, asset_type: 'cash' })).toBeNull();
		expect(first(ruleM03, { qty: 0, asset_type: 'cash', status: 'holding' })?.level).toBe(
			'ERROR'
		);
		// L1: planned null / closed 0 are not false positives
		expect(first(ruleM03, { qty: null, asset_type: 'stock', status: 'planned' })).toBeNull();
		expect(first(ruleM03, { qty: 0, asset_type: 'stock', status: 'closed' })).toBeNull();
		// bond matches DB (no fractional check)
		expect(first(ruleM03, { qty: 1.5, asset_type: 'bond', status: 'holding' })).toBeNull();
	});

	it('R-VAL-R13', () => {
		expect(
			first(ruleR13, {
				kind: 'equity_analysis',
				profile: 'finance-manager',
				meta: { target_price: 100 }
			})?.level
		).toBe('WARN');
		expect(
			first(ruleR13, {
				kind: 'equity_analysis',
				profile: 'finance-manager',
				body_md: 'In my opinion the market is quiet.'
			})
		).toBeNull();
		expect(
			first(ruleR13, {
				kind: 'equity_analysis',
				profile: 'finance-manager',
				body_md: '목표가 120000원'
			})?.level
		).toBe('WARN');
		expect(
			first(ruleR13, {
				kind: 'equity_analysis',
				profile: 'equity-analyst',
				meta: { target_price: 100 }
			})
		).toBeNull();
	});

	it('R-VAL-R14', () => {
		const ok = {
			meta: {
				candidates: [
					{
						rank: 1,
						ticker: '005380',
						close: 100,
						l1: 95,
						l2: 90,
						stop: 85,
						confidence: 0.7,
						reason: 'setup'
					}
				]
			}
		};
		expect(first(ruleR14, ok)).toBeNull();
		expect(
			first(ruleR14, {
				meta: { candidates: [{ rank: 1, ticker: 'A', extra: true }] }
			})?.id
		).toBe('R-VAL-R14');
	});

	it('R-VAL-R15', () => {
		expect(
			first(ruleR15, {
				kind: 'equity_analysis',
				meta: { alignment: 'aligned', selection_reason: 'why' }
			})
		).toBeNull();
		expect(
			first(ruleR15, {
				kind: 'equity_analysis',
				meta: { alignment: 'yes' }
			})?.level
		).toBe('ERROR');
		expect(
			first(ruleR15, {
				kind: 'daily_brief',
				meta: { alignment: 'aligned' }
			})?.level
		).toBe('ERROR');
	});

	it('R-VAL-J08', () => {
		// L3: generic uppercase words are not tickers without instruments list
		expect(
			first(ruleJ08, { tags: ['AI', 'ETF', 'IPO', 'USA', '반도체'], knownTickers: [] })
		).toBeNull();
		expect(
			first(ruleJ08, { tags: ['005380', 'theme'], knownTickers: [] })?.level
		).toBe('WARN');
		expect(
			first(ruleJ08, { tags: ['GOOGL'], knownTickers: ['GOOGL'] })?.level
		).toBe('WARN');
		expect(first(ruleJ08, { tags: ['GOOGL'], knownTickers: [] })).toBeNull();
	});

	it('R-VAL-J02', () => {
		const incomplete = {
			kind: 'buy',
			instrument_id: null,
			price: null,
			qty: null,
			currency: null
		};
		const strict = first(ruleJ02, incomplete, 'strict');
		expect(strict?.level).toBe('ERROR');
		expect(strict?.id).toBe('R-VAL-J02');

		const migration = first(ruleJ02, incomplete, 'migration');
		expect(migration?.level).toBe('WARN');
		expect(migration?.id).toBe('R-VAL-J02');

		const result = runRules([ruleJ02], incomplete, 'strict');
		expect(result.ok).toBe(false);
		expect(result.errors[0]?.id).toBe('R-VAL-J02');

		const mig = runRules([ruleJ02], incomplete, 'migration');
		expect(mig.ok).toBe(true);
		expect(mig.warnings[0]?.level).toBe('WARN');

		// L5: plan does not require instrument
		expect(
			first(ruleJ02, {
				kind: 'plan',
				instrument_id: null,
				price: null,
				qty: null,
				currency: null
			})
		).toBeNull();

		// L5: migration WARN still holds when J03 would fail
		expect(shouldHoldJournalForDbChecks(incomplete)).toBe(true);
		expect(
			shouldHoldJournalForDbChecks({
				kind: 'buy',
				instrument_id: 'i1',
				price: 10,
				qty: 1,
				currency: null
			})
		).toBe(true);
		expect(
			shouldHoldJournalForDbChecks({
				kind: 'buy',
				instrument_id: 'i1',
				price: 10,
				qty: 1,
				currency: 'USD'
			})
		).toBe(false);
	});

	it('buy_plan meta stub (Q-33) never uses R-VAL-R15', () => {
		expect(validateBuyPlanMeta({ anything: true, nested: { a: 1 } })).toBeNull();
		expect(validateBuyPlanMeta(null)).toBeNull();
		expect(validateBuyPlanMeta(undefined)).toBeNull();
		expect(validateBuyPlanMeta([])).toBeNull();
		expect(validateBuyPlanMeta(42)).toBeNull();
		// M-1 fail-path: [] / undefined / non-object never emit R15
		for (const input of ['not-object', [], undefined] as const) {
			const issue = validateBuyPlanMeta(input);
			expect(issue).toBeNull();
		}
	});
});
