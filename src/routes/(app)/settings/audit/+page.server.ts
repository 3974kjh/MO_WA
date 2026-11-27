import type { PageServerLoad } from './$types';
import { countAuditRuleIds, forUser, listAuditLog, listBotClients } from '$lib/server/repo';
import {
	AUDIT_RULE_COUNT_MAX_PAGES,
	AUDIT_RULE_COUNT_PAGE
} from '$lib/server/repo/auditStats.repo';
import { requireUser } from '$lib/server/web/requireUser';
import { INFO_LOAD_ERROR, publicListError } from '$lib/server/web/listError';
import { parseAuditFilter } from '$lib/settings/view';

/** FE-09 활동 기록 `/settings/audit`: 읽기 전용. 필터는 URL 쿼리(형식 검증 후 서버에서 적용). */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);
	const filter = parseAuditFilter(url.searchParams);
	const [rows, ruleIds, bots] = await Promise.all([
		listAuditLog(repo, filter),
		countAuditRuleIds(repo),
		listBotClients(repo)
	]);
	return {
		title: '활동 기록',
		filter,
		rows: rows.data,
		truncated: rows.truncated,
		ruleIdCounts: ruleIds.data,
		// 경고 기록이 아주 많으면 앞쪽 일부만 센 값이다(auditStats.repo.ts) — 센 건수 상한을 실어 화면이 알린다(없으면 null)
		ruleIdCountsLimit: ruleIds.truncated
			? AUDIT_RULE_COUNT_PAGE * AUDIT_RULE_COUNT_MAX_PAGES
			: null,
		bots: bots.data.map((b) => ({ id: b.id, name: b.name })),
		error:
			publicListError('settings.audit', rows.error, INFO_LOAD_ERROR) ??
			publicListError('settings.audit.rules', ruleIds.error, INFO_LOAD_ERROR) ??
			publicListError('settings.audit.bots', bots.error, INFO_LOAD_ERROR)
	};
};
