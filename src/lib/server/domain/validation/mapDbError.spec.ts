import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	CONSTRAINT_TO_RULE_ID,
	UNMAPPED_MARKER,
	extractRuleIdsFromMessage,
	mapConstraintToRuleId,
	mapDbErrorToRuleIds
} from './mapDbError';

const fixturePath = join(
	dirname(fileURLToPath(import.meta.url)),
	'fixtures/result.pglite.reference.txt'
);

describe('mapDbError', () => {
	it('extracts [R-…] and [DISPLAY-ID] tags from messages', () => {
		expect(extractRuleIdsFromMessage('denied [R-PERM-03] spoof')).toEqual(['R-PERM-03']);
		expect(extractRuleIdsFromMessage('[DISPLAY-ID] display_no and owner_id are immutable')).toEqual([
			'DISPLAY-ID'
		]);
		expect(
			extractRuleIdsFromMessage('qty fail [R-VAL-M03] and also [R-VAL-P09]')
		).toEqual(['R-VAL-M03', 'R-VAL-P09']);
	});

	it('maps PR #7 constraint names to rule IDs', () => {
		expect(mapConstraintToRuleId('instruments_krx_code')).toBe('R-VAL-C01');
		expect(mapConstraintToRuleId('reports_headline_check')).toBe('R-VAL-R12');
		expect(mapConstraintToRuleId('journal_tickers_check')).toBe('R-VAL-C04');
		expect(mapConstraintToRuleId('mowa_check_qty')).toBe('R-VAL-M03');
		expect(CONSTRAINT_TO_RULE_ID.reports_meta_alignment).toBe('R-VAL-R15');
	});

	it('never returns an empty array — unmapped keeps code and constraint', () => {
		const ids = mapDbErrorToRuleIds({
			message: 'something blew up',
			code: 'XX000',
			constraint: 'totally_unknown_constraint'
		});
		expect(ids).toHaveLength(1);
		expect(ids[0]).toBe(`${UNMAPPED_MARKER}:XX000:totally_unknown_constraint`);
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

		expect(
			mapDbErrorToRuleIds({
				message: '[DISPLAY-ID] display_no and owner_id are immutable'
			})
		).toEqual(['DISPLAY-ID']);
	});

	it('maps every constraint name printed in PR #7 result.pglite.reference.txt', () => {
		const text = readFileSync(fixturePath, 'utf8');
		// Reference truncates long names mid-token; accept open or closed quotes.
		const names = [
			...text.matchAll(/constraint "([a-zA-Z0-9_]+)/g)
		].map((m) => m[1]!);
		expect(names.length).toBeGreaterThan(10);
		for (const name of names) {
			const rule = mapConstraintToRuleId(name);
			expect(rule, `unmapped constraint from reference: ${name}`).toBeTruthy();
			expect(rule).not.toMatch(new RegExp(`^${UNMAPPED_MARKER}`));
		}
	});
});
