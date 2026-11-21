import type { Actions, PageServerLoad } from './$types';
import { handleArchiveRestore, loadArchive } from '$lib/server/web/archivePage';
import { requireUser } from '$lib/server/web/requireUser';

/** FE-08 보관함 `/archive`: 6개 유형의 보관 행과 복원. 영구 삭제 없음(Q-01). */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	return loadArchive({ supabase: locals.supabase, user });
};

export const actions: Actions = {
	// 여러 유형을 복원하므로 table을 고정하지 않는다. 6개 유형만 받고 공유 handleRestore
	// (ARCHIVE_TABLES 검사 + owner 필터 + 사용자만 복원)로 넘긴다.
	restore: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleArchiveRestore(locals.supabase, user.id, await request.formData());
	}
};
