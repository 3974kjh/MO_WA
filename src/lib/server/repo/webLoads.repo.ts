/**
 * BE-11 / BE-19 enriched loads for web +page.server.ts.
 * Uses user-session RLS client via RepoClient. Never invents display_id.
 */
import { PORTFOLIO_STATUSES, type PortfolioStatus } from '$lib/portfolio/status';
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
	/** FE-07: 요청 이유(평문으로만 표시, 마크다운 렌더 안 함). */
	reason_md: string | null;
	/** FE-07: 결정 메모(고친 이유·거절 이유). */
	decision_note: string | null;
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
	reason_md?: string | null;
	decision_note?: string | null;
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

/**
 * FE-07 Low-4: 변경 요청(position_proposals) 조회에서 toCard·attention 필터가 실제로 읽는 컬럼만.
 * owner_id·display_no·proposed_by_user·client_ref·decided_by·result_position_id·acknowledged_by·updated_at은 뺀다.
 * RawProposal·toCard에 필드를 더하면 여기에도 더해야 한다.
 */
export const POSITION_PROPOSAL_COLUMNS =
	'id, display_id, change_type, status, calc_note, reason_md, decision_note, proposed_by_type, proposed_by, evidence, attention_started_at, acknowledged_at, base_version, proposed_values, applied_values, current_values, position_id, instrument_id, created_at, expires_at, held_at, decided_at';

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
		reason_md: row.reason_md ?? null,
		decision_note: row.decision_note ?? null,
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

/**
 * Nav 대기 pill 건수: pending 포지션 제안 + pending 원칙 제안. on_hold 등 다른 상태는 세지 않는다.
 * 어느 한쪽이라도 오류면 과소 집계하지 않고 0과 그 오류를 돌려준다.
 */
export async function countPendingProposals(
	repo: RepoClient
): Promise<{ data: number; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let posQ = fromRepo(repo, 'position_proposals').select('id', { count: 'exact', head: true });
	posQ = withOwnerFilter(posQ, ownerId).eq('status', 'pending');
	let prinQ = fromRepo(repo, 'principle_proposals').select('id', { count: 'exact', head: true });
	prinQ = withOwnerFilter(prinQ, ownerId).eq('status', 'pending');
	const [pos, prin] = await Promise.all([posQ, prinQ]);
	if (pos.error) return { data: 0, error: pos.error as Error };
	if (prin.error) return { data: 0, error: prin.error as Error };
	return { data: (pos.count ?? 0) + (prin.count ?? 0), error: null };
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
		.select(POSITION_PROPOSAL_COLUMNS)
		.in('status', ['pending', 'on_hold'])
		.order('created_at', { ascending: false })
		.range(params.offset, params.offset + params.limit - 1);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: toPageResult([], 0, params), error: error as Error };
	const cards = await enrichProposals(repo, (data ?? []) as RawProposal[]);
	return { data: toPageResult(cards, count ?? 0, params), error: null };
}

/** FE-07 '지난 내역' 상태(pending·on_hold가 아닌 종결 상태). */
export const PROPOSAL_HISTORY_STATUSES = [
	'approved',
	'rejected',
	'superseded',
	'cancelled',
	'expired',
	'conflict'
] as const;

/**
 * FE-07 '지난 내역' — 종결된 변경 요청(사용자 기록 수정 포함), 결정 시각 최신순. 읽기 전용.
 * 정렬(확인 필요 → 새 요청으로 바뀜·봇이 취소 → 반영됨·거절)은 화면에서 한다.
 */
export async function listProposalHistory(
	repo: RepoClient,
	params: PageParams
): Promise<{ data: PageResult<ProposalCard>; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let countQ = fromRepo(repo, 'position_proposals').select('id', {
		count: 'exact',
		head: true
	});
	countQ = withOwnerFilter(countQ, ownerId).in('status', [...PROPOSAL_HISTORY_STATUSES]);
	const { count, error: countErr } = await countQ;
	if (countErr) return { data: toPageResult([], 0, params), error: countErr as Error };

	let q = fromRepo(repo, 'position_proposals')
		.select(POSITION_PROPOSAL_COLUMNS)
		.in('status', [...PROPOSAL_HISTORY_STATUSES])
		.order('decided_at', { ascending: false, nullsFirst: false })
		.order('created_at', { ascending: false })
		.range(params.offset, params.offset + params.limit - 1);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: toPageResult([], 0, params), error: error as Error };
	const cards = await enrichProposals(repo, (data ?? []) as RawProposal[]);
	return { data: toPageResult(cards, count ?? 0, params), error: null };
}

/** FE-07: 원칙 개정 요청 카드(principle_proposals). 본문은 평문 미리보기만(앞부분). */
export type PrincipleCard = {
	id: string;
	display_id: string;
	status: string;
	clause_ref: string | null;
	body_preview: string;
	body_truncated: boolean;
	reason_md: string | null;
	decision_note: string | null;
	proposed_by_type: string;
	proposer_name: string;
	evidence_chips: ReturnType<typeof evidenceChips>;
	attention_started_at: string | null;
	acknowledged_at: string | null;
	base_version: number | null;
	created_at: string;
	held_at: string | null;
	decided_at: string | null;
};

/** 화면으로 보내는 원칙 본문 미리보기 최대 글자 수(본문은 최대 1MB라 전부 싣지 않는다). */
export const PRINCIPLE_BODY_PREVIEW_MAX = 2000;

const PRINCIPLE_LIST_COLUMNS =
	'id, display_id, status, clause_ref, proposed_body_md, reason_md, decision_note, proposed_by_type, proposed_by, evidence, attention_started_at, acknowledged_at, base_version, created_at, held_at, decided_at';

type RawPrinciple = {
	id: string;
	display_id: string | null;
	status: string;
	clause_ref: string | null;
	proposed_body_md: string | null;
	reason_md: string | null;
	decision_note: string | null;
	proposed_by_type: string;
	proposed_by: string | null;
	evidence?: unknown;
	attention_started_at: string | null;
	acknowledged_at: string | null;
	base_version: number | null;
	created_at: string;
	held_at: string | null;
	decided_at: string | null;
};

async function principleCards(repo: RepoClient, rows: RawPrinciple[]): Promise<PrincipleCard[]> {
	const botNames = await botNameMap(
		repo,
		rows.filter((r) => r.proposed_by_type === 'bot' && r.proposed_by).map((r) => r.proposed_by!)
	);
	return rows.map((r) => {
		const body = r.proposed_body_md ?? '';
		const chars = [...body];
		return {
			id: r.id,
			display_id: r.display_id ?? '',
			status: r.status,
			clause_ref: r.clause_ref,
			body_preview: chars.slice(0, PRINCIPLE_BODY_PREVIEW_MAX).join(''),
			body_truncated: chars.length > PRINCIPLE_BODY_PREVIEW_MAX,
			reason_md: r.reason_md,
			decision_note: r.decision_note,
			proposed_by_type: r.proposed_by_type,
			proposer_name: proposerDisplayName({
				proposed_by_type: r.proposed_by_type,
				botName: r.proposed_by ? botNames.get(r.proposed_by) : null
			}),
			evidence_chips: evidenceChips(r.evidence ?? []),
			attention_started_at: r.attention_started_at,
			acknowledged_at: r.acknowledged_at,
			base_version: r.base_version,
			created_at: r.created_at,
			held_at: r.held_at,
			decided_at: r.decided_at
		};
	});
}

async function listPrinciplesByStatus(
	repo: RepoClient,
	statuses: readonly string[],
	params: PageParams,
	orderByDecided: boolean
): Promise<{ data: PageResult<PrincipleCard>; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let countQ = fromRepo(repo, 'principle_proposals').select('id', { count: 'exact', head: true });
	countQ = withOwnerFilter(countQ, ownerId).in('status', [...statuses]);
	const { count, error: countErr } = await countQ;
	if (countErr) return { data: toPageResult([], 0, params), error: countErr as Error };

	let q = fromRepo(repo, 'principle_proposals')
		.select(PRINCIPLE_LIST_COLUMNS)
		.in('status', [...statuses]);
	if (orderByDecided) q = q.order('decided_at', { ascending: false, nullsFirst: false });
	q = q
		.order('created_at', { ascending: false })
		.range(params.offset, params.offset + params.limit - 1);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: toPageResult([], 0, params), error: error as Error };
	const cards = await principleCards(repo, (data ?? []) as unknown as RawPrinciple[]);
	return { data: toPageResult(cards, count ?? 0, params), error: null };
}

/** FE-07 확인 대기 — 원칙 개정 요청 pending + on_hold. 읽기 전용. */
export function listPrincipleQueue(repo: RepoClient, params: PageParams) {
	return listPrinciplesByStatus(repo, ['pending', 'on_hold'], params, false);
}

/** FE-07 지난 내역 — 원칙 개정 요청 종결 상태, 결정 시각 최신순. 읽기 전용. */
export function listPrincipleHistory(repo: RepoClient, params: PageParams) {
	return listPrinciplesByStatus(repo, PROPOSAL_HISTORY_STATUSES, params, true);
}

/**
 * BE-19 '확인 필요' list — attention_started_at window only (R-PERM-13).
 * Also returns principle_proposals with the same filter.
 */
export async function listAttentionNeeded(
	repo: RepoClient,
	now: Date = new Date()
): Promise<{
	data: { positions: ProposalCard[]; principles: PrincipleCard[] };
	error: Error | null;
}> {
	const filter = attentionNeededFilter(now);
	const ownerId = requireOwnerId(repo);

	let pq = fromRepo(repo, 'position_proposals')
		.select(POSITION_PROPOSAL_COLUMNS)
		.in('status', [...filter.statuses])
		.is('acknowledged_at', null)
		.gt('attention_started_at', filter.attentionStartedAfter)
		.order('attention_started_at', { ascending: false });
	pq = withOwnerFilter(pq, ownerId);

	let rq = fromRepo(repo, 'principle_proposals')
		.select(PRINCIPLE_LIST_COLUMNS)
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
	// FE-07: 원칙은 확인 대기·지난 내역과 같은 매퍼(평문 미리보기 앞 2000자·잘림·조항).
	const principles = await principleCards(repo, (prinRes.data ?? []) as unknown as RawPrinciple[]);

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

/** FE-05 포트폴리오 표 전용 읽기 값(보유·매수 계획·보유 종료). 쓰기 경로 없음. */
export type PortfolioPositionDetail = {
	id: string;
	instrument_id: string;
	status: PortfolioStatus;
	currency: 'KRW' | 'USD';
	qty: number | null;
	avg_price: number | null;
	breakeven: number | null;
	memo: string | null;
	trigger_price: number | null;
	trigger_direction: 'below' | 'above';
	watch_only: boolean;
	/** 종목 시장(통화 불일치 ⚠ 판정용). 종목을 못 읽으면 null */
	market: string | null;
};

/**
 * FE-05: 포트폴리오 표 행(보관 안 된 holding·planned·closed). 손익분기 가격·메모·감시 가격은 **읽기 전용**으로만 싣는다.
 * 종목 시장은 같은 요청에서 instruments(market)로 붙인다(요청 1번).
 */
export async function listPortfolioPositionDetails(
	repo: RepoClient
): Promise<{ data: PortfolioPositionDetail[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'positions')
		.select(
			'id, instrument_id, status, currency, qty, avg_price, breakeven, memo, trigger_price, trigger_direction, watch_only, instruments(market)'
		)
		.is('archived_at', null)
		.in('status', [...PORTFOLIO_STATUSES]);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: [], error: error as Error };
	const rows = (data ?? []) as unknown as Array<
		Omit<PortfolioPositionDetail, 'market'> & {
			instruments: { market: string | null } | Array<{ market: string | null }> | null;
		}
	>;
	return {
		data: rows.map(({ instruments, ...r }) => {
			const inst = Array.isArray(instruments) ? instruments[0] : instruments;
			return {
				...r,
				trigger_direction: r.trigger_direction === 'above' ? 'above' : 'below',
				watch_only: Boolean(r.watch_only),
				market: inst?.market ?? null
			};
		}),
		error: null
	};
}

/** FE-05: 행 '확인 대기' 배지와 '보류 N건 별도'용. 제안 본문은 읽지 않는다. */
export type OpenProposalRefs = {
	/** position_id가 있는 pending·on_hold 포지션 제안 */
	positions: Array<{ position_id: string; status: 'pending' | 'on_hold' }>;
	/** 보류(on_hold) 건수: 포지션 제안 + 원칙 개정 요청 */
	holdCount: number;
};

export async function listOpenProposalRefs(
	repo: RepoClient
): Promise<{ data: OpenProposalRefs; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let posQ = fromRepo(repo, 'position_proposals')
		.select('position_id, status')
		.in('status', ['pending', 'on_hold']);
	posQ = withOwnerFilter(posQ, ownerId);
	let prinQ = fromRepo(repo, 'principle_proposals').select('id', { count: 'exact', head: true });
	prinQ = withOwnerFilter(prinQ, ownerId).eq('status', 'on_hold');
	const [pos, prin] = await Promise.all([posQ, prinQ]);
	const empty = { positions: [], holdCount: 0 };
	if (pos.error) return { data: empty, error: pos.error as Error };
	if (prin.error) return { data: empty, error: prin.error as Error };
	const rows = (pos.data ?? []) as Array<{ position_id: string | null; status: string }>;
	return {
		data: {
			positions: rows
				.filter((r) => r.position_id != null)
				.map((r) => ({
					position_id: r.position_id!,
					status: r.status === 'on_hold' ? 'on_hold' : 'pending'
				})),
			holdCount: rows.filter((r) => r.status === 'on_hold').length + (prin.count ?? 0)
		},
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

export type InstrumentMeta = InstrumentLabel & { asset_type: string | null };

/** FE-07 변경 요청·기록 수정용 종목 이름·코드·자산 유형(수량 단위 확인용). 읽기 전용. */
export async function listInstrumentMeta(
	repo: RepoClient,
	instrumentIds: string[]
): Promise<{ data: InstrumentMeta[]; error: Error | null }> {
	const ids = [...new Set(instrumentIds.filter(Boolean))];
	if (ids.length === 0) return { data: [], error: null };
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'instruments').select('id, name, ticker, asset_type').in('id', ids);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: [], error: error as Error };
	return { data: (data ?? []) as InstrumentMeta[], error: null };
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
