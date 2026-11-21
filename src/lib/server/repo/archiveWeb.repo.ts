/**
 * FE-08 보관함 load용 읽기(사용자 세션 RLS 클라이언트, owner 필터). 쓰기 없음.
 * 유형마다 보관된 행(archived_at not null)만, 명시 열만, 최신 보관순 limit건.
 */
import {
	ARCHIVE_KINDS,
	BOT_ARCHIVE_TOOL,
	type ArchiveKind,
	type ArchivedRowsByKind,
	type BotArchiveAudit
} from '$lib/archive/view';
import type { RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';

/** 유형별 최대 건수(초과분은 truncated로 알린다). */
export const ARCHIVE_LIST_LIMIT = 100;

/** 유형별 명시 select. 본문(body_md 등) 같은 큰 열은 읽지 않는다. */
export const ARCHIVE_SELECT: Record<ArchiveKind, string> = {
	reports: 'id, title, report_date, archived_at',
	journal_entries: 'id, title, entry_date, archived_at',
	positions: 'id, status, archived_at, instruments(ticker, name)',
	instruments: 'id, ticker, name, archived_at',
	decisions: 'id, title, archived_at',
	events: 'id, title, event_date, archived_at'
};

export type ArchivedRowsResult = {
	data: ArchivedRowsByKind;
	/** limit을 넘어 잘린 유형 */
	truncated: ArchiveKind[];
	/** 읽지 못한 유형별 오류(원문은 서버 로그용) */
	errors: Partial<Record<ArchiveKind, Error>>;
};

async function listArchivedOf(
	repo: RepoClient,
	kind: ArchiveKind,
	limit: number
): Promise<{ data: unknown[]; truncated: boolean; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, kind).select(ARCHIVE_SELECT[kind]).not('archived_at', 'is', null);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.order('archived_at', { ascending: false }).limit(limit + 1);
	if (error) return { data: [], truncated: false, error: error as Error };
	const rows = (data ?? []) as unknown[];
	return { data: rows.slice(0, limit), truncated: rows.length > limit, error: null };
}

/** 6개 유형을 한 번에(병렬). 한 유형이 실패해도 나머지는 돌려준다. */
export async function listArchivedRows(
	repo: RepoClient,
	limit: number = ARCHIVE_LIST_LIMIT
): Promise<ArchivedRowsResult> {
	const results = await Promise.all(ARCHIVE_KINDS.map((k) => listArchivedOf(repo, k, limit)));
	const data = {} as Record<ArchiveKind, unknown[]>;
	const truncated: ArchiveKind[] = [];
	const errors: Partial<Record<ArchiveKind, Error>> = {};
	ARCHIVE_KINDS.forEach((k, i) => {
		const r = results[i];
		data[k] = r.data;
		if (r.truncated) truncated.push(k);
		if (r.error) errors[k] = r.error;
	});
	return { data: data as unknown as ArchivedRowsByKind, truncated, errors };
}

/** 봇 보관 활동 기록 최대 건수 */
export const BOT_ARCHIVE_AUDIT_LIMIT = 500;

/**
 * '보관한 사람' 표시용: since 이후 봇의 보관 도구 성공 기록(명시 열, owner 필터, 최신순 limit).
 */
export async function listBotArchiveAudits(
	repo: RepoClient,
	since: string,
	limit: number = BOT_ARCHIVE_AUDIT_LIMIT
): Promise<{ data: BotArchiveAudit[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'mcp_audit_log')
		.select('bot_client_id, tool, affected_ids, created_at')
		.eq('actor_type', 'bot')
		.eq('result', 'ok')
		.in('tool', Object.values(BOT_ARCHIVE_TOOL))
		.gte('created_at', since);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
	if (error) return { data: [], error: error as Error };
	return { data: (data ?? []) as BotArchiveAudit[], error: null };
}
