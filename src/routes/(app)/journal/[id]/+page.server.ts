import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isJournalId, loadJournal } from '$lib/server/web/journalPage';
import { requireUser } from '$lib/server/web/requireUser';

/**
 * FE-06 `/journal/[id]` — 새로고침·직접 진입. 목록과 같은 화면에 상세를 연 채로 렌더한다(목록 쿼리 유지).
 * 쓰기 액션은 없다(폼은 `/journal?/create|update|archive`로 보낸다).
 */
export const load: PageServerLoad = async ({ locals, url, params }) => {
	const user = requireUser(locals.user);
	if (!isJournalId(params.id)) error(404, 'Not found');
	return loadJournal({ supabase: locals.supabase, user }, url, params.id);
};
