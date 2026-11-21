import type { Actions, PageServerLoad } from './$types';
import { parseJournalQuery } from '$lib/routing/listQuery';
import { parsePageParams } from '$lib/server/domain/web/pagination';
import { forUser, listJournalPage } from '$lib/server/repo';
import { handleArchive, handleRestore } from '$lib/server/web/proposalActions';
import { requireUser } from '$lib/server/web/requireUser';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);
	const params = parsePageParams(url, { defaultSize: 30 });
	const query = parseJournalQuery(url.searchParams);
	const { data, error } = await listJournalPage(repo, params, query);
	return {
		title: '매매일지',
		query,
		journal: data,
		error: error?.message ?? null
	};
};

export const actions: Actions = {
	archive: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		const form = await request.formData();
		if (!form.get('table')) form.set('table', 'journal_entries');
		return handleArchive(locals.supabase, user.id, form);
	},
	restore: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		const form = await request.formData();
		if (!form.get('table')) form.set('table', 'journal_entries');
		return handleRestore(locals.supabase, user.id, form);
	}
};
