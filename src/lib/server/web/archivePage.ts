/**
 * FE-08 보관함 load·복원 액션 공통부(`/archive`).
 *
 * - load: 6개 유형의 보관 행(listArchivedRows, 명시 열·owner 필터·limit) + 봇 보관 활동 기록으로 '보관한 사람'.
 *   '보관한 사람'은 실패 닫힘: 기록을 못 읽었거나 상한(500)에 걸려 그 행의 구간을 다 보지 못했으면 '—'.
 *   한 유형이 실패해도 나머지는 보인다(error 문구 하나, 원문은 서버 로그).
 * - restore: 여러 유형을 복원하므로 table을 한 값으로 고정하지 않는다. 화면 6개 유형(ARCHIVE_KINDS)만 받고,
 *   공유 handleRestore(ARCHIVE_TABLES 검사 + forUser owner 필터 + 사용자만 복원)로 넘긴다.
 *   클라이언트가 보낸 다른 필드(owner_id 등)는 넘기지 않는다. 영구 삭제는 없다(Q-01).
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
	archivedByOf,
	auditWindowStart,
	countArchive,
	isArchiveKind,
	toArchiveItems,
	type ArchiveCounts,
	type ArchiveItem,
	type ArchiveKind,
	type BotArchiveAudit,
	type BotArchiveAuditScan,
	ARCHIVE_KINDS
} from '$lib/archive/view';
import {
	forUser,
	listArchivedRows,
	listBotArchiveAudits,
	listJournalBotNames,
	type ArchivableTable
} from '$lib/server/repo';
import { failValidation } from '$lib/server/web/actionErrors';
import { publicListError } from '$lib/server/web/listError';
import { handleRestore } from '$lib/server/web/proposalActions';
import type { Database } from '$lib/types/database.types';

// 화면 유형은 모두 공유 보관 테이블이어야 한다(컴파일 시 검사).
const _kindsAreArchivable: readonly ArchivableTable[] = ARCHIVE_KINDS;
void _kindsAreArchivable;

export type ArchivePageData = {
	title: string;
	items: ArchiveItem[];
	counts: ArchiveCounts;
	truncated: ArchiveKind[];
	error: string | null;
	/** '보관한 사람'을 확인하지 못함(활동 기록·봇 이름 읽기 실패) */
	byError: boolean;
};

export async function loadArchive(ctx: {
	supabase: SupabaseClient<Database>;
	user: User;
}): Promise<ArchivePageData> {
	const repo = forUser(ctx.supabase, ctx.user.id);
	const rows = await listArchivedRows(repo);
	const items = toArchiveItems(rows.data);

	const errors = ARCHIVE_KINDS.map((k) => publicListError(`archive.${k}`, rows.errors[k])).filter(
		(m): m is string => m !== null
	);

	let byError = false;
	const since = auditWindowStart(items);
	// 봇 보관 가능 유형이 없으면 읽을 것도 없다(빈 구간을 다 본 것으로 본다).
	let scan: BotArchiveAuditScan | null = { rows: [], complete: true, oldestScanned: null };
	let botNames = new Map<string, string>();
	if (since) {
		const a = await listBotArchiveAudits(repo, since);
		if (a.error) {
			publicListError('archive.audit', a.error);
			scan = null;
			byError = true;
		} else {
			scan = {
				rows: a.data,
				complete: !a.truncated,
				oldestScanned: oldestCreatedAt(a.data)
			};
			const ids = a.data.map((x) => x.bot_client_id).filter((x): x is string => !!x);
			const names = await listJournalBotNames(repo, ids);
			if (names.error) {
				// 이름만 못 읽음: 확정 매칭은 '봇'으로 보인다(나로 바꾸지 않음).
				publicListError('archive.bots', names.error);
				byError = true;
			}
			botNames = names.data;
		}
	}
	for (const it of items) it.archivedBy = archivedByOf(it, scan, botNames);

	return {
		title: '보관함',
		items,
		counts: countArchive(items),
		truncated: rows.truncated,
		error: errors[0] ?? null,
		byError
	};
}

/** 읽은 기록 중 가장 오래된 created_at(정렬과 무관하게 계산). 없으면 null. */
function oldestCreatedAt(rows: readonly BotArchiveAudit[]): string | null {
	let min: number | null = null;
	let out: string | null = null;
	for (const r of rows) {
		const t = Date.parse(r.created_at);
		if (Number.isNaN(t)) continue;
		if (min == null || t < min) {
			min = t;
			out = r.created_at;
		}
	}
	return out;
}

export async function handleArchiveRestore(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = String(form.get('id') ?? '').trim();
	const table = String(form.get('table') ?? '').trim();
	if (!id || !isArchiveKind(table)) {
		return failValidation(400, 'R-SYS-03', '복원할 항목을 찾지 못했어요.');
	}
	const safe = new FormData();
	safe.set('id', id);
	safe.set('table', table);
	return handleRestore(supabase, ownerId, safe);
}
