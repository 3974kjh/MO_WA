import type { Actions, PageServerLoad } from './$types';
import { parsePageParams } from '$lib/server/domain/web/pagination';
import {
	forUser,
	listAttentionNeeded,
	listPositionCards,
	listQueueProposals
} from '$lib/server/repo';
import {
	handleAck,
	handleApprove,
	handleArchive,
	handleCorrect,
	handleHold,
	handleReject,
	handleRestore
} from '$lib/server/web/proposalActions';
import { requireUser } from '$lib/server/web/requireUser';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);
	const queueParams = parsePageParams(url, { defaultSize: 20 });

	const [queue, positions, attention] = await Promise.all([
		listQueueProposals(repo, queueParams),
		listPositionCards(repo),
		listAttentionNeeded(repo)
	]);

	return {
		title: '포트폴리오',
		queue: queue.data,
		queueError: queue.error?.message ?? null,
		positions: positions.data,
		positionsError: positions.error?.message ?? null,
		attentionNeeded: attention.data,
		attentionError: attention.error?.message ?? null
	};
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleApprove(locals.supabase, user.id, await request.formData());
	},
	reject: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleReject(locals.supabase, user.id, await request.formData());
	},
	hold: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleHold(locals.supabase, user.id, await request.formData());
	},
	/** BE-19: apply_user_correction (R-VAL-P11) */
	correct: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleCorrect(locals.supabase, user.id, await request.formData());
	},
	/** BE-19: acknowledge_proposal / decide_principle_proposal('ack') */
	ack: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleAck(locals.supabase, user.id, await request.formData());
	},
	archive: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleArchive(locals.supabase, user.id, await request.formData());
	},
	restore: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleRestore(locals.supabase, user.id, await request.formData());
	}
};
