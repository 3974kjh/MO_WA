import { countPending } from '$lib/approvals/pending';
import { fixtureProposals } from '$lib/fixtures/proposals';
import type { LayoutServerLoad } from './$types';

/**
 * (app) 공통 데이터 — FE-01 AppShell의 대기 pill.
 * TODO(BE-11): position_proposals에서 status='pending'만 센 값으로 교체(보류 on_hold 제외, G-1). 지금은 픽스처.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		pendingCount: countPending(fixtureProposals),
		userEmail: locals.user?.email ?? null
	};
};
