import { describe, expect, it } from 'vitest';
import {
	CONSTRAINT_TO_RULE_ID,
	extractRuleIdsFromMessage,
	mapConstraintToRuleId,
	mapDbErrorToRuleIds
} from './mapDbError';

describe('mapDbError', () => {
	it('extracts [R-…] tags from messages', () => {
		expect(extractRuleIdsFromMessage('denied [R-PERM-03] spoof')).toEqual(['R-PERM-03']);
		expect(
			extractRuleIdsFromMessage('qty fail [R-VAL-M03] and also [R-VAL-P09]')
		).toEqual(['R-VAL-M03', 'R-VAL-P09']);
	});

	it('maps constraint names to rule IDs', () => {
		expect(mapConstraintToRuleId('mowa_check_qty')).toBe('R-VAL-M03');
		expect(mapConstraintToRuleId('reports_headline_check')).toBe('R-VAL-R12');
		expect(mapConstraintToRuleId('journal_tickers_check')).toBe('R-VAL-J08');
		expect(CONSTRAINT_TO_RULE_ID.targets_valuation_guard).toBe('R-VAL-R13');
	});

	it('mapDbErrorToRuleIds combines message tags and constraints', () => {
		expect(
			mapDbErrorToRuleIds({
				message: 'new row violates check constraint "mowa_check_qty"',
				constraint: 'mowa_check_qty'
			})
		).toContain('R-VAL-M03');

		expect(
			mapDbErrorToRuleIds({
				message: 'guard rejected [R-PERM-02]',
				details: null
			})
		).toEqual(['R-PERM-02']);
	});
});
