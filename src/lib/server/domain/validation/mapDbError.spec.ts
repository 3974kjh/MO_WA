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

const dir = dirname(fileURLToPath(import.meta.url));
const fullNamesPath = join(dir, 'fixtures/pr7-full-constraint-names.txt');

describe('mapDbError', () => {
	it('extracts [R-…] and [DISPLAY-ID] tags from messages', () => {
		expect(extractRuleIdsFromMessage('denied [R-PERM-03] spoof')).toEqual(['R-PERM-03']);
		expect(extractRuleIdsFromMessage('[DISPLAY-ID] immutable')).toEqual(['DISPLAY-ID']);
	});

	it('maps only exact full constraint names', () => {
		expect(mapConstraintToRuleId('instruments_krx_code')).toBe('R-VAL-C01');
		expect(mapConstraintToRuleId('journal_tickers_check')).toBe('R-VAL-C04');
		expect(mapConstraintToRuleId('reports_domain_check')).toBe('R-VAL-R02');
		expect(mapConstraintToRuleId('positions_status_check')).toBe('R-VAL-P02');
		expect(mapConstraintToRuleId('reports_owner_id_kind_report_date_slug_key')).toBe('R-VAL-R03');
	});

	it('treats truncated / weak names as negative (no mapping)', () => {
		const truncated = [
			'principle_proposals_',
			'market_indi',
			'p',
			'reports_',
			'position_proposals_ev',
			'positions_watch_only_no_trigge',
			'journal_trade_needs_inst'
		];
		for (const name of truncated) {
			expect(mapConstraintToRuleId(name), name).toBeNull();
		}
		// misclassification / weak evidence → unmapped
		expect(mapConstraintToRuleId('journal_entries_owner_id_client_ref_key')).toBeNull();
		expect(mapConstraintToRuleId('bot_clients_propose_only_fm')).toBeNull();
		expect(mapConstraintToRuleId('principle_proposals_evidence_check')).toBeNull();
		expect(mapConstraintToRuleId('reports_period_order')).toBeNull();
	});

	it('never returns an empty array — unmapped keeps code and constraint', () => {
		const ids = mapDbErrorToRuleIds({
			message: 'something blew up',
			code: 'XX000',
			constraint: 'totally_unknown_constraint'
		});
		expect(ids).toEqual([`${UNMAPPED_MARKER}:XX000:totally_unknown_constraint`]);
	});

	it('compares CONSTRAINT_TO_RULE_ID keys against PR #7 full-name fixture', () => {
		const listed = readFileSync(fullNamesPath, 'utf8')
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);
		expect(listed.length).toBeGreaterThan(20);
		for (const name of listed) {
			expect(
				CONSTRAINT_TO_RULE_ID[name],
				`fixture name missing from map: ${name}`
			).toBeTruthy();
		}
		for (const key of Object.keys(CONSTRAINT_TO_RULE_ID)) {
			expect(listed, `map key not in PR #7 full-name fixture: ${key}`).toContain(key);
		}
	});
});
