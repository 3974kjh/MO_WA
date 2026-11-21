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
const sqlNamesPath = join(dir, 'fixtures/pr7-sql-constraint-names.txt');

function loadSqlConstraintNames(): string[] {
	return readFileSync(sqlNamesPath, 'utf8')
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith('#'));
}

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
		expect(mapConstraintToRuleId('instruments_asset_type_check')).toBe('R-VAL-I01');
		expect(mapConstraintToRuleId('positions_currency_check')).toBe('R-VAL-M01');
		expect(mapConstraintToRuleId('positions_qty_check')).toBe('R-VAL-M03');
		expect(mapConstraintToRuleId('reports_title_check')).toBe('R-VAL-S05');
		expect(mapConstraintToRuleId('reports_body_md_check')).toBe('R-VAL-S02');
		expect(mapConstraintToRuleId('journal_entries_source_url_check')).toBe('R-VAL-S04');
		expect(mapConstraintToRuleId('targets_valuation_opinion_check')).toBe('R-VAL-I04');
		expect(mapConstraintToRuleId('re_complexes_households_check')).toBe('R-VAL-M06');
		expect(mapConstraintToRuleId('re_complexes_total_score_check')).toBe('R-VAL-M08');
		expect(mapConstraintToRuleId('re_market_stats_source_check')).toBe('R-VAL-RE04');
	});

	it('maps client_ref unique keys to R-PERM-11 (not J06)', () => {
		const keys = [
			'journal_entries_owner_id_client_ref_key',
			'decisions_owner_id_client_ref_key',
			'events_owner_id_client_ref_key',
			'position_proposals_owner_id_client_ref_key',
			'principle_proposals_owner_id_client_ref_key'
		];
		for (const name of keys) {
			expect(mapConstraintToRuleId(name), name).toBe('R-PERM-11');
			expect(mapConstraintToRuleId(name)).not.toBe('R-VAL-J06');
		}
		expect(
			mapDbErrorToRuleIds({
				message: 'duplicate key value violates unique constraint "journal_entries_owner_id_client_ref_key"',
				code: '23505'
			})
		).toEqual(['R-PERM-11']);
	});

	it('treats truncated / weak names as negative (no mapping)', () => {
		const truncated = [
			'principle_proposals_',
			'market_indi',
			'p',
			'reports_',
			'position_proposals_ev',
			'positions_watch_only_no_trigge',
			'journal_trade_needs_inst',
			'journal_entries_owner_id_client_ref' // truncated — missing _key
		];
		for (const name of truncated) {
			expect(mapConstraintToRuleId(name), name).toBeNull();
		}
		expect(mapConstraintToRuleId('bot_clients_propose_only_fm')).toBeNull();
		expect(mapConstraintToRuleId('principle_proposals_evidence_check')).toBeNull();
		expect(mapConstraintToRuleId('reports_period_order')).toBeNull();
	});

	it('returns null for prototype keys (constructor / toString / __proto__)', () => {
		for (const name of ['constructor', 'toString', '__proto__'] as const) {
			expect(mapConstraintToRuleId(name), name).toBeNull();
			expect(
				mapDbErrorToRuleIds({ message: 'x', code: 'XX000', constraint: name })
			).toEqual([`${UNMAPPED_MARKER}:XX000:${name}`]);
		}
	});

	it('never returns an empty array — unmapped keeps code and constraint', () => {
		const ids = mapDbErrorToRuleIds({
			message: 'something blew up',
			code: 'XX000',
			constraint: 'totally_unknown_constraint'
		});
		expect(ids).toEqual([`${UNMAPPED_MARKER}:XX000:totally_unknown_constraint`]);
	});

	it('every mapped key exists in the PR #7 SQL-extracted fixture (non-circular)', () => {
		const sqlNames = loadSqlConstraintNames();
		expect(sqlNames.length).toBeGreaterThan(40);
		const sqlSet = new Set(sqlNames);
		for (const key of Object.keys(CONSTRAINT_TO_RULE_ID)) {
			expect(sqlSet.has(key), `map key not found in PR #7 SQL fixture: ${key}`).toBe(true);
		}
		// Fixture must not be a dump of the map: SQL list includes unmapped names.
		expect(sqlSet.has('bot_clients_propose_only_fm')).toBe(true);
		expect(sqlSet.has('reports_period_order')).toBe(true);
		expect(Object.hasOwn(CONSTRAINT_TO_RULE_ID, 'bot_clients_propose_only_fm')).toBe(false);
		expect(Object.hasOwn(CONSTRAINT_TO_RULE_ID, 'reports_period_order')).toBe(false);
	});
});
