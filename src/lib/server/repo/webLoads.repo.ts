/**
 * BE-11 / BE-19 enriched loads for web +page.server.ts.
 * Uses user-session RLS client via RepoClient. Never invents display_id.
 */
import { countPending } from '$lib/approvals/pending';
import {
	attentionNeededFilter,
	evidenceChips,
	proposerDisplayName,
	versionFieldsForClient,
	type AttentionLike
} from '$lib/server/domain/proposals';
import { computeDashboardValuation } from '$lib/server/domain/dashboard/valuation';
import { toPageResult, type PageParams, type PageResult } from '$lib/server/domain/web/pagination';
import {
	applyBriefingFilter,
	applyJournalFilter,
	type BriefingListFilter,
	type JournalListFilter
} from '$lib/server/domain/web/listFilters';
import type { RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';
import { getLatestIndicator, kospiChangePctByDates, listLatestPrices } from './market.repo';

export type ProposalCard = {
	id: string;
	display_id: string;
	change_type: string;
	status: string;
	calc_note: string | null;
	proposed_by_type: string;
	proposer_name: string;
	evidence_chips: ReturnType<typeof evidenceChips>;
	attention_started_at: string | null;
	acknowledged_at: string | null;
	base_version: number | null;
	approval_version: number | null;
	would_conflict: boolean;
	proposed_values: Record<string, unknown>;
	applied_values: Record<string, unknown> | null;
	current_values: Record<string, unknown> | null;
	position_id: string | null;
	instrument_id: string | null;
	created_at: string;
	expires_at: string;
	held_at: string | null;
	decided_at: string | null;
};

export type PositionCard = {
	id: string;
	instrument_id: string;
	status: string;
	currency: 'KRW' | 'USD';
	qty: number | null;
	avg_price: number | null;
	approval_version: number;
	trigger_price: number | null;
	trigger_direction: 'below' | 'above';
	watch_only: boolean;
	latest_price: number | null;
	latest_price_as_of: string | null;
	latest_price_currency: string | null;
};

type RawProposal = AttentionLike & {
	id: string;
	display_id: string | null;
	change_type: string;
	calc_note: string | null;
	proposed_by_type: string;
	proposed_by: string | null;
	proposed_values: Record<string, unknown>;
	applied_values: Record<string, unknown> | null;
	current_values: Record<string, unknown> | null;
	evidence?: unknown;
	base_version: number | null;
	position_id: string | null;
	instrument_id: string | null;
	created_at: string;
	expires_at: string;
	held_at: string | null;
	decided_at: string | null;
};

async function botNameMap(repo: RepoClient, botIds: string[]): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const ids = [...new Set(botIds.filter(Boolean))];
	if (ids.length === 0) return map;
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'bot_clients').select('id, name').in('id', ids);
	q = withOwnerFilter(q, ownerId);
	const { data } = await q;
	for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
		map.set(row.id, row.name);
	}
	return map;
}

async function approvalVersionMap(
	repo: RepoClient,
	positionIds: string[]
): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	const ids = [...new Set(positionIds.filter(Boolean))];
	if (ids.length === 0) return map;
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'positions').select('id, approval_version').in('id', ids);
	q = withOwnerFilter(q, ownerId);
	const { data } = await q;
	for (const row of (data ?? []) as Array<{ id: string; approval_version: number }>) {
		map.set(row.id, row.approval_version);
	}
	return map;
}

function toCard(
	row: RawProposal,
	botNames: Map<string, string>,
	approvalVersions: Map<string, number>
): ProposalCard {
	const approval_version =
		row.position_id != null ? (approvalVersions.get(row.position_id) ?? null) : null;
	const versions = versionFieldsForClient(row.base_version, approval_version);
	return {
		id: row.id,
		display_id: row.display_id ?? '',
		change_type: row.change_type,
		status: row.status,
		calc_note: row.calc_note,
		proposed_by_type: row.proposed_by_type,
		proposer_name: proposerDisplayName({
			proposed_by_type: row.proposed_by_type,
			botName: row.proposed_by ? botNames.get(row.proposed_by) : null
		}),
		evidence_chips: evidenceChips(row.evidence ?? []),
		attention_started_at: row.attention_started_at ?? null,
		acknowledged_at: row.acknowledged_at ?? null,
		base_version: versions.base_version,
		approval_version: versions.approval_version,
		would_conflict: versions.would_conflict,
		proposed_values: (row.proposed_values ?? {}) as Record<string, unknown>,
		applied_values: (row.applied_values ?? null) as Record<string, unknown> | null,
		current_values: (row.current_values ?? null) as Record<string, unknown> | null,
		position_id: row.position_id,
		instrument_id: row.instrument_id,
		created_at: row.created_at,
		expires_at: row.expires_at,
		held_at: row.held_at,
		decided_at: row.decided_at
	};
}

async function enrichProposals(repo: RepoClient, rows: RawProposal[]): Promise<ProposalCard[]> {
	const botNames = await botNameMap(
		repo,
		rows.filter((r) => r.proposed_by_type === 'bot' && r.proposed_by).map((r) => r.proposed_by!)
	);
	const approvalVersions = await approvalVersionMap(
		repo,
		rows.map((r) => r.position_id).filter((id): id is string => id != null)
	);
	return rows.map((r) => toCard(r, botNames, approvalVersions));
}

export async function countPendingProposals(
	repo: RepoClient
): Promise<{ data: number; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'position_proposals').select('id', { count: 'exact', head: true });
	q = withOwnerFilter(q, ownerId).eq('status', 'pending');
	const { count, error } = await q;
	if (error) return { data: 0, error: error as Error };
	return { data: count ?? 0, error: null };
}

/** pending + on_hold queue (portfolio #queue). Pending pill uses countPendingProposals. */
export async function listQueueProposals(
	repo: RepoClient,
	params: PageParams
): Promise<{ data: PageResult<ProposalCard>; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let countQ = fromRepo(repo, 'position_proposals').select('id', {
		count: 'exact',
		head: true
	});
	countQ = withOwnerFilter(countQ, ownerId).in('status', ['pending', 'on_hold']);
	const { count, error: countErr } = await countQ;
	if (countErr) {
		return {
			data: toPageResult([], 0, params),
			error: countErr as Error
		};
	}

	let q = fromRepo(repo, 'position_proposals')
		.select('*')
		.in('status', ['pending', 'on_hold'])
		.order('created_at', { ascending: false })
		.range(params.offset, params.offset + params.limit - 1);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: toPageResult([], 0, params), error: error as Error };
	const cards = await enrichProposals(repo, (data ?? []) as RawProposal[]);
	return { data: toPageResult(cards, count ?? 0, params), error: null };
}

/**
 * BE-19 '확인 필요' list — attention_started_at window only (R-PERM-13).
 * Also returns principle_proposals with the same filter.
 */
export async function listAttentionNeeded(
	repo: RepoClient,
	now: Date = new Date()
): Promise<{
	data: { positions: ProposalCard[]; principles: ProposalCard[] };
	error: Error | null;
}> {
	const filter = attentionNeededFilter(now);
	const ownerId = requireOwnerId(repo);

	let pq = fromRepo(repo, 'position_proposals')
		.select('*')
		.in('status', [...filter.statuses])
		.is('acknowledged_at', null)
		.gt('attention_started_at', filter.attentionStartedAfter)
		.order('attention_started_at', { ascending: false });
	pq = withOwnerFilter(pq, ownerId);

	let rq = fromRepo(repo, 'principle_proposals')
		.select('*')
		.in('status', [...filter.statuses])
		.is('acknowledged_at', null)
		.gt('attention_started_at', filter.attentionStartedAfter)
		.order('attention_started_at', { ascending: false });
	rq = withOwnerFilter(rq, ownerId);

	const [posRes, prinRes] = await Promise.all([pq, rq]);
	if (posRes.error) {
		return {
			data: { positions: [], principles: [] },
			error: posRes.error as Error
		};
	}
	if (prinRes.error) {
		return {
			data: { positions: [], principles: [] },
			error: prinRes.error as Error
		};
	}

	const positions = await enrichProposals(repo, (posRes.data ?? []) as RawProposal[]);
	const prinRows = (prinRes.data ?? []) as Array<
		AttentionLike & {
			id: string;
			display_id: string | null;
			proposed_by_type: string;
			proposed_by: string | null;
			created_at: string;
			expires_at: string;
			held_at: string | null;
			decided_at: string | null;
			base_version: number;
		}
	>;
	const botNames = await botNameMap(
		repo,
		prinRows.filter((r) => r.proposed_by_type === 'bot' && r.proposed_by).map((r) => r.proposed_by!)
	);
	const principles: ProposalCard[] = prinRows.map((r) => ({
		id: r.id,
		display_id: r.display_id ?? '',
		change_type: 'principle',
		status: r.status,
		calc_note: null,
		proposed_by_type: r.proposed_by_type,
		proposer_name: proposerDisplayName({
			proposed_by_type: r.proposed_by_type,
			botName: r.proposed_by ? botNames.get(r.proposed_by) : null
		}),
		evidence_chips: evidenceChips((r as { evidence?: unknown }).evidence),
		attention_started_at: r.attention_started_at ?? null,
		acknowledged_at: r.acknowledged_at ?? null,
		base_version: r.base_version,
		approval_version: null,
		would_conflict: false,
		proposed_values: {},
		applied_values: null,
		current_values: null,
		position_id: null,
		instrument_id: null,
		created_at: r.created_at,
		expires_at: r.expires_at,
		held_at: r.held_at,
		decided_at: r.decided_at
	}));

	return { data: { positions, principles }, error: null };
}

export async function listPositionCards(
	repo: RepoClient
): Promise<{ data: PositionCard[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'positions')
		.select(
			'id, instrument_id, status, currency, qty, avg_price, approval_version, trigger_price, trigger_direction, watch_only, archived_at'
		)
		.is('archived_at', null)
		.in('status', ['holding', 'planned']);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: [], error: error as Error };

	const rows = (data ?? []) as Array<{
		id: string;
		instrument_id: string;
		status: string;
		currency: 'KRW' | 'USD';
		qty: number | null;
		avg_price: number | null;
		approval_version: number;
		trigger_price: number | null;
		trigger_direction: 'below' | 'above';
		watch_only: boolean;
	}>;
	const instrumentIds = rows.map((r) => r.instrument_id);
	const { data: prices, error: priceErr } = await listLatestPrices(repo, instrumentIds);
	if (priceErr) return { data: [], error: priceErr };
	const priceMap = new Map(prices.map((p) => [p.instrument_id, p]));

	return {
		data: rows.map((r) => {
			const p = priceMap.get(r.instrument_id);
			return {
				id: r.id,
				instrument_id: r.instrument_id,
				status: r.status,
				currency: r.currency,
				qty: r.qty,
				avg_price: r.avg_price,
				approval_version: r.approval_version,
				trigger_price: r.trigger_price,
				trigger_direction: r.trigger_direction,
				watch_only: r.watch_only,
				latest_price: p?.close ?? null,
				latest_price_as_of: p?.as_of ?? null,
				latest_price_currency: p?.currency ?? null
			};
		}),
		error: null
	};
}

/**
 * FE-03: 이미 읽은 포지션 카드(listPositionCards)를 넘기면 다시 읽지 않는다.
 * 넘기지 않으면 예전처럼 직접 읽는다.
 */
export async function loadDashboardValuation(repo: RepoClient, preloaded?: PositionCard[]) {
	let positions: PositionCard[];
	if (preloaded) {
		positions = preloaded;
	} else {
		const res = await listPositionCards(repo);
		if (res.error) return { data: null, error: res.error };
		positions = res.data;
	}

	const instrumentIds = positions.map((p) => p.instrument_id);
	const { data: prices, error: priceErr } = await listLatestPrices(repo, instrumentIds);
	if (priceErr) return { data: null, error: priceErr };
	const { data: usdkrw, error: fxErr } = await getLatestIndicator(repo, 'usdkrw');
	if (fxErr) return { data: null, error: fxErr };

	const latestByInstrument = new Map(prices.map((p) => [p.instrument_id, p]));
	const positionInstrument = new Map(positions.map((p) => [p.id, p.instrument_id]));

	const valuation = computeDashboardValuation({
		positions: positions.map((p) => ({
			id: p.id,
			qty: p.qty,
			currency: p.currency,
			status: p.status
		})),
		latestByInstrument,
		positionInstrument,
		usdkrw: usdkrw ? { value: usdkrw.value, as_of: usdkrw.as_of } : null
	});

	return { data: valuation, error: null };
}

export type InstrumentLabel = { id: string; name: string; ticker: string };

/** FE-03 홈 카드용 종목 이름·코드(id → label). 보관된 종목도 이름은 보여 준다. */
export async function listInstrumentLabels(
	repo: RepoClient,
	instrumentIds: string[]
): Promise<{ data: InstrumentLabel[]; error: Error | null }> {
	const ids = [...new Set(instrumentIds.filter(Boolean))];
	if (ids.length === 0) return { data: [], error: null };
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'instruments').select('id, name, ticker').in('id', ids);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: [], error: error as Error };
	return { data: (data ?? []) as InstrumentLabel[], error: null };
}

export type BriefingListItem = {
	id: string;
	kind: string;
	slug: string;
	headline: string | null;
	title: string;
	report_date: string;
	tags: string[];
	/** G-6 kospi change_pct for report_date (null when missing). */
	kospi_change_pct: number | null;
};

export async function listBriefingsWithKospi(
	repo: RepoClient,
	params: PageParams,
	filter?: Partial<BriefingListFilter>
): Promise<{ data: PageResult<BriefingListItem>; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let countQ = fromRepo(repo, 'reports').select('id', { count: 'exact', head: true });
	countQ = withOwnerFilter(countQ, ownerId)
		.in('kind', ['daily_brief', 'weekly_report'])
		.is('archived_at', null);
	countQ = applyBriefingFilter(countQ, filter);
	const { count, error: countErr } = await countQ;
	if (countErr) return { data: toPageResult([], 0, params), error: countErr as Error };

	let q = fromRepo(repo, 'reports')
		.select('id, kind, slug, headline, title, report_date, tags')
		.in('kind', ['daily_brief', 'weekly_report'])
		.is('archived_at', null);
	q = applyBriefingFilter(q, filter);
	q = withOwnerFilter(q, ownerId);
	const pageQ = q
		.order('report_date', { ascending: false })
		.range(params.offset, params.offset + params.limit - 1);
	const { data, error } = await pageQ;
	if (error) return { data: toPageResult([], 0, params), error: error as Error };

	const rows = (data ?? []) as Array<{
		id: string;
		kind: string;
		slug: string;
		headline: string | null;
		title: string;
		report_date: string;
		tags: string[];
	}>;
	const { data: kospiMap, error: kospiErr } = await kospiChangePctByDates(
		repo,
		rows.map((r) => r.report_date)
	);
	if (kospiErr) return { data: toPageResult([], 0, params), error: kospiErr };

	const items: BriefingListItem[] = rows.map((r) => ({
		...r,
		tags: r.tags ?? [],
		kospi_change_pct: kospiMap.get(r.report_date) ?? null
	}));
	return { data: toPageResult(items, count ?? 0, params), error: null };
}

export type BriefingSource = { label: string; publisher: string; accessed_at: string };

/**
 * FE-04 상세 메타(daily_brief, slug `daily`, 날짜 하나). **본문(body_md)·렌더 결과(body_blocks·toc)는 받지 않는다.**
 * 운영 상세는 본문을 렌더하지 않는다(무료 Workers CPU 한도). 상세 본문은 getReportRenderColumns()로 저장된 캐시만 읽는다.
 */
export type BriefingDetailMeta = {
	id: string;
	title: string;
	headline: string | null;
	summary: string | null;
	report_date: string;
	tags: string[];
	version: number;
	generated_at: string | null;
	updated_at: string;
	sources: BriefingSource[];
};

export async function getDailyBriefingMeta(
	repo: RepoClient,
	reportDate: string
): Promise<{ data: BriefingDetailMeta | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'reports')
		.select('id, title, headline, summary, report_date, tags, version, generated_at, updated_at')
		.eq('kind', 'daily_brief')
		.eq('slug', 'daily')
		.eq('report_date', reportDate)
		.is('archived_at', null);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	if (error) return { data: null, error: error as Error };
	if (!data) return { data: null, error: null };
	const row = data as Omit<BriefingDetailMeta, 'sources'>;

	let sq = fromRepo(repo, 'report_sources')
		.select('label, publisher, accessed_at')
		.eq('report_id', row.id)
		.order('sort', { ascending: true });
	sq = withOwnerFilter(sq, ownerId);
	const { data: src, error: srcErr } = await sq;
	if (srcErr) return { data: null, error: srcErr as Error };
	return {
		data: { ...row, tags: row.tags ?? [], sources: (src ?? []) as BriefingSource[] },
		error: null
	};
}

/**
 * FE-04 상세 본문: 저장된 렌더 캐시 컬럼만 읽는다(body_md는 받지 않음). 쓰기는 service_role RPC
 * `mowa_set_report_render_cache`만 한다(BE-07). 값 검사·키 비교는 호출부(cacheRead.readStoredRender)가 한다.
 */
export type ReportRenderColumns = { version: number; body_blocks: unknown; toc: unknown };

export async function getReportRenderColumns(
	repo: RepoClient,
	reportId: string
): Promise<{ data: ReportRenderColumns | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'reports')
		.select('version, body_blocks, toc')
		.eq('id', reportId)
		.is('archived_at', null);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	if (error) return { data: null, error: error as Error };
	return { data: (data as ReportRenderColumns | null) ?? null, error: null };
}

export async function listJournalPage(
	repo: RepoClient,
	params: PageParams,
	filter?: Partial<JournalListFilter>
): Promise<{
	data: PageResult<Record<string, unknown>>;
	error: Error | null;
}> {
	const ownerId = requireOwnerId(repo);
	let countQ = fromRepo(repo, 'journal_entries').select('id', {
		count: 'exact',
		head: true
	});
	countQ = withOwnerFilter(countQ, ownerId).is('archived_at', null);
	countQ = applyJournalFilter(countQ, filter);
	const { count, error: countErr } = await countQ;
	if (countErr) return { data: toPageResult([], 0, params), error: countErr as Error };

	let q = fromRepo(repo, 'journal_entries').select('*').is('archived_at', null);
	q = applyJournalFilter(q, filter);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q
		.order('entry_date', { ascending: false })
		.range(params.offset, params.offset + params.limit - 1);
	if (error) return { data: toPageResult([], 0, params), error: error as Error };
	return {
		data: toPageResult((data ?? []) as Record<string, unknown>[], count ?? 0, params),
		error: null
	};
}

/** Re-export fixture helper for tests that still use status arrays. */
export { countPending };
