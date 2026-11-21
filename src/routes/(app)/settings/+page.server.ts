import type { PageServerLoad } from './$types';
import { countAuditRuleIds, forUser } from '$lib/server/repo';
import { requireUser } from '$lib/server/web/requireUser';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);
	const { data: ruleIdCounts, error } = await countAuditRuleIds(repo);
	return {
		title: '설정',
		ruleIdCounts,
		error: error?.message ?? null
	};
};
