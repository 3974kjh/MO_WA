import type { Actions, PageServerLoad } from './$types';
import { countAuditRuleIds, forUser, listBotClients } from '$lib/server/repo';
import {
	handleIssueBotKey,
	handleRevokeBotKey,
	handleSetBotKeyExpiry,
	handleSetBotKeyRateLimit
} from '$lib/server/web/botKeyActions';
import { BOT_PROFILES, defaultScopesForProfile } from '$lib/server/mcp/botProfiles';
import { requireUser } from '$lib/server/web/requireUser';
import { INFO_LOAD_ERROR, publicListError } from '$lib/server/web/listError';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);
	const [ruleIds, bots] = await Promise.all([countAuditRuleIds(repo), listBotClients(repo)]);
	return {
		title: '설정',
		ruleIdCounts: ruleIds.data,
		botClients: bots.data,
		// 프로필별 기본 권한(읽기 전용 상수). 키 원문·해시는 load에 싣지 않는다.
		profileScopes: Object.fromEntries(BOT_PROFILES.map((p) => [p, defaultScopesForProfile(p)])),
		error:
			publicListError('settings', ruleIds.error, INFO_LOAD_ERROR) ??
			publicListError('settings.bots', bots.error, INFO_LOAD_ERROR)
	};
};

export const actions: Actions = {
	/** BE-12: issue bot API key — plaintext in `apiKey` once only; Cache-Control: no-store. */
	issue: async ({ request, locals, setHeaders }) => {
		const user = requireUser(locals.user);
		return handleIssueBotKey(locals.supabase, user.id, await request.formData(), { setHeaders });
	},
	/** BE-12: revoke (soft) — no DELETE. */
	revoke: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleRevokeBotKey(locals.supabase, user.id, await request.formData());
	},
	/** BE-12: set / clear expires_at (importer may not clear). */
	setExpiry: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleSetBotKeyExpiry(locals.supabase, user.id, await request.formData());
	},
	/** BE-12: update rate_limit_per_min (1–600). */
	setRateLimit: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleSetBotKeyRateLimit(locals.supabase, user.id, await request.formData());
	}
};
