import type { Actions, PageServerLoad } from './$types';
import { handleArchive, handleRestore } from '$lib/server/web/proposalActions';
import { handleJournalCreate, handleJournalUpdate } from '$lib/server/web/journalActions';
import { loadJournal } from '$lib/server/web/journalPage';
import { requireUser } from '$lib/server/web/requireUser';

/** FE-06 매매일지 목록 `/journal?type=&ticker=&view=&q=&page=`. 상세는 같은 화면의 shallow routing(`/journal/[id]`). */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	return loadJournal({ supabase: locals.supabase, user }, url);
};

export const actions: Actions = {
	// FE-06: 사용자 작성·수정(쓰기 경로 — 사전 리뷰 대상). 상세 경로(/journal/[id])의 폼도 이 액션으로 보낸다.
	create: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleJournalCreate(locals.supabase, user.id, await request.formData());
	},
	update: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleJournalUpdate(locals.supabase, user.id, await request.formData());
	},
	// 보관·복원은 이 라우트에서 항상 journal_entries로 고정한다. 클라이언트가 보낸 table 값은 무시한다
	// (ARCHIVE_TABLES에 다른 테이블도 있어 조작된 폼이 다른 테이블을 보관하지 못하게).
	archive: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		const form = await request.formData();
		form.set('table', 'journal_entries');
		return handleArchive(locals.supabase, user.id, form);
	},
	restore: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		const form = await request.formData();
		form.set('table', 'journal_entries');
		return handleRestore(locals.supabase, user.id, form);
	}
};
