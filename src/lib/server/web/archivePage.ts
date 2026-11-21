/**
 * FE-08 보관함 load·복원 액션 공통부(`/archive`).
 *
 * - load: 6개 유형의 보관 행(listArchivedRows, 명시 열·owner 필터·limit) + 봇 보관 활동 기록으로 '보관한 사람'.
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
	let audits: Awaited<ReturnType<typeof listBotArchiveAudits>>['data'] | null = [];
	let botNames = new Map<string, string>();
	if (since) {
		const a = await listBotArchiveAudits(repo, since);
		if (a.error) {
			publicListError('archive.audit', a.error);
			audits = null;
			byError = true;
		} else {
			audits = a.data;
			const ids = a.data.map((x) => x.bot_client_id).filter((x): x is string => !!x);
			const names = await listJournalBotNames(repo, ids);
			if (names.error) {
				publicListError('archive.bots', names.error);
				byError = true;
			}
			botNames = names.data;
		}
	}
	for (const it of items) it.archivedBy = archivedByOf(it, audits, botNames);

	return {
		title: '보관함',
		items,
		counts: countArchive(items),
		truncated: rows.truncated,
		error: errors[0] ?? null,
		byError
	};
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
