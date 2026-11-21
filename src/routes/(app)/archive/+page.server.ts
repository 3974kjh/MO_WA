import type { Actions, PageServerLoad } from './$types';
import { forUser, listJournalEntries, listPositions, listReports } from '$lib/server/repo';
import { handleRestore } from '$lib/server/web/proposalActions';
import { requireUser } from '$lib/server/web/requireUser';
import { publicListError } from '$lib/server/web/listError';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);

	const [reports, positions, journal] = await Promise.all([
		listReports(repo, { includeArchived: true }),
		listPositions(repo, { includeArchived: true }),
		listJournalEntries(repo, { includeArchived: true })
	]);

	const onlyArchived = <T extends { archived_at?: string | null }>(rows: T[]) =>
		rows.filter((r) => r.archived_at != null);

	return {
		title: '보관함',
		reports: onlyArchived(reports.data),
		positions: onlyArchived(positions.data),
		journal: onlyArchived(journal.data),
		// 사용자 문구는 하나, 서버 로그에는 있는 오류를 모두 남긴다.
		error:
			[
				publicListError('archive.reports', reports.error),
				publicListError('archive.positions', positions.error),
				publicListError('archive.journal', journal.error)
			].find((m) => m !== null) ?? null
	};
};

export const actions: Actions = {
	restore: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleRestore(locals.supabase, user.id, await request.formData());
	}
};
