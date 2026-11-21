import { describe, expect, it } from 'vitest';
import {
	ALL_MCP_TOOL_NAMES,
	assertReportKindScope,
	assertToolScope,
	filterToolsByScopes,
	hasReportWriteScope,
	REPORT_KIND_TO_SCOPE,
	scopeForReportKind,
	SPIKE_TOOL_NAMES,
	TOOL_REQUIRED_SCOPE
} from '../scopes';
import { toolsForContext } from './index';

const READ_TOOLS = [
	'whoami',
	'get_dashboard_context',
	'get_report',
	'list_reports',
	'search',
	'list_instruments',
	'list_positions',
	'list_proposals',
	'list_journal_entries',
	'list_decisions',
	'list_events'
];

describe('scope-filtered tools/list', () => {
	it('spike tools echo/db_ping are gone', () => {
		expect(ALL_MCP_TOOL_NAMES).not.toContain('echo');
		expect(ALL_MCP_TOOL_NAMES).not.toContain('db_ping');
		expect(SPIKE_TOOL_NAMES).toEqual(['whoami']);
	});

	it('read key lists exactly the read tools', () => {
		expect(toolsForContext({ scopes: ['read'] }).sort()).toEqual([...READ_TOOLS].sort());
	});

	it('empty scopes lists nothing', () => {
		expect(toolsForContext({ scopes: [] })).toEqual([]);
	});

	it('write-only key lists only its write tools', () => {
		expect(toolsForContext({ scopes: ['journal:write'] })).toEqual([
			'add_journal_entry',
			'update_journal_entry',
			'archive_journal_entry'
		]);
	});

	it('read-only key does not list write tools', () => {
		const writeTools = Object.entries(TOOL_REQUIRED_SCOPE)
			.filter(([, scope]) => scope !== 'read')
			.map(([name]) => name);
		const listed = filterToolsByScopes([...ALL_MCP_TOOL_NAMES], { scopes: ['read'] });
		expect(listed.some((t) => writeTools.includes(t))).toBe(false);
	});

	it('import:all unlocks write tools except proposal tools', () => {
		const listed = toolsForContext({ scopes: ['import:all'] });
		expect(listed).toContain('whoami');
		expect(listed).toContain('add_journal_entry');
		expect(listed).toContain('upsert_report');
		expect(listed).toContain('upsert_event');
		expect(listed).not.toContain('propose_position_change');
		expect(listed).not.toContain('cancel_proposal');
		expect(listed).not.toContain('propose_principle_change');
		expect(listed).not.toContain('cancel_principle_proposal');
		expect(listed).not.toContain('list_principle_proposals');
	});

	it('principles:propose lists exactly the three BE-17 tools (no approve/reject/hold)', () => {
		const listed = toolsForContext({ scopes: ['principles:propose'] }).sort();
		expect(listed).toEqual(
			['cancel_principle_proposal', 'list_principle_proposals', 'propose_principle_change'].sort()
		);
		expect(listed).not.toContain('approve_principle_proposal');
		expect(listed).not.toContain('reject_principle_proposal');
		expect(listed).not.toContain('hold_principle_proposal');
		expect(listed).not.toContain('decide_principle_proposal');
	});

	it('maps every BE-06~10 / BE-17 tool to its design scope', () => {
		expect(TOOL_REQUIRED_SCOPE).toMatchObject({
			create_planned_position: 'positions:annotate',
			update_position_reference: 'positions:annotate',
			propose_position_change: 'positions:propose',
			cancel_proposal: 'positions:propose',
			propose_principle_change: 'principles:propose',
			cancel_principle_proposal: 'principles:propose',
			list_principle_proposals: 'principles:propose',
			upsert_instrument: 'instruments:write',
			record_price_snapshots: 'prices:write',
			record_portfolio_snapshot: 'portfolio:snapshot',
			record_market_indicators: 'indicators:write',
			upsert_decision: 'decisions:write',
			archive_decision: 'decisions:write'
		});
	});
});

describe('report write scopes', () => {
	it('any report scope unlocks upsert/archive_report', () => {
		for (const scope of Object.values(REPORT_KIND_TO_SCOPE)) {
			expect(assertToolScope({ scopes: [scope] }, 'upsert_report')).toBeNull();
			expect(assertToolScope({ scopes: [scope] }, 'archive_report')).toBeNull();
			expect(hasReportWriteScope({ scopes: [scope] })).toBe(true);
		}
	});

	it('read-only key is denied upsert_report', () => {
		expect(assertToolScope({ scopes: ['read'] }, 'upsert_report')?.structuredContent.code).toBe(
			'FORBIDDEN_SCOPE'
		);
		expect(hasReportWriteScope({ scopes: ['read'] })).toBe(false);
	});

	it('scopeForReportKind resolves buy_plan subtype and rejects principles', () => {
		expect(scopeForReportKind('daily_brief')).toBe('reports:daily_brief');
		expect(scopeForReportKind('equity_analysis')).toBe('reports:equity_analysis');
		expect(scopeForReportKind('equity_analysis', 'buy_plan')).toBe('reports:buy_plan_draft');
		expect(scopeForReportKind('principles')).toBeNull();
		expect(scopeForReportKind('constructor')).toBeNull();
	});

	it('assertReportKindScope checks the specific kind', () => {
		const ctx = { scopes: ['reports:daily_brief'] };
		expect(assertReportKindScope(ctx, 'daily_brief')).toBeNull();
		expect(assertReportKindScope(ctx, 'weekly_report')?.isError).toBe(true);
		expect(
			assertReportKindScope({ scopes: ['reports:equity_analysis'] }, 'equity_analysis', 'buy_plan')
				?.isError
		).toBe(true);
		expect(
			assertReportKindScope({ scopes: ['reports:buy_plan_draft'] }, 'equity_analysis', 'buy_plan')
		).toBeNull();
		expect(assertReportKindScope({ scopes: ['import:all'] }, 'strategy')).toBeNull();
		expect(assertReportKindScope({ scopes: ['import:all'] }, 'principles')?.isError).toBe(true);
	});
});

describe('instrument / event any-of scopes', () => {
	it('upsert_instrument: instruments:write, instruments:enrich or import:all', () => {
		for (const scope of ['instruments:write', 'instruments:enrich', 'import:all']) {
			expect(assertToolScope({ scopes: [scope] }, 'upsert_instrument')).toBeNull();
		}
		expect(assertToolScope({ scopes: ['read'] }, 'upsert_instrument')?.isError).toBe(true);
	});

	it('upsert/archive_event: any events domain scope or import:all', () => {
		for (const scope of ['events:stock', 'events:macro', 'events:realestate', 'import:all']) {
			expect(assertToolScope({ scopes: [scope] }, 'upsert_event')).toBeNull();
			expect(assertToolScope({ scopes: [scope] }, 'archive_event')).toBeNull();
		}
		expect(assertToolScope({ scopes: ['journal:write'] }, 'upsert_event')?.isError).toBe(true);
	});
});
