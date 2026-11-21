import type { LayoutServerLoad } from './$types';
import { countPendingProposals, forUser } from '$lib/server/repo';

/**
 * (app) 공통 데이터 — AppShell 대기 pill.
 * BE-11: position_proposals에서 status='pending'만 센다(보류 on_hold 제외, G-1).
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	let pendingCount = 0;
	if (locals.user?.id) {
		const repo = forUser(locals.supabase, locals.user.id);
		const { data } = await countPendingProposals(repo);
		pendingCount = data;
	}
	return {
		pendingCount,
		userEmail: locals.user?.email ?? null
	};
};
