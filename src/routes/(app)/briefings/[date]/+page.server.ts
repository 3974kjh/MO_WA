import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { parseDetailMode } from '$lib/routing/listQuery';
import { isReportDate } from '$lib/routing/briefings';
import { forUser, getDailyBriefingMeta } from '$lib/server/repo';
import { requireUser } from '$lib/server/web/requireUser';
import { readBriefingBody } from '$lib/server/web/briefingBody';

/**
 * FE-04 브리핑 상세 `/briefings/[date]?mode=` (summary 기본, URL에서 생략).
 * 이 load는 **본문을 렌더하지 않는다**(렌더러·캐시 렌더 함수를 import·호출하지 않음). 상세 모드에서만 저장된 렌더 캐시
 * (body_blocks·toc, service_role RPC만 씀)를 읽어 키·형태·목차 검사를 통과하면 `body`로 넘긴다. 아니면 null(준비 중 문구).
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireUser(locals.user);
	if (!isReportDate(params.date)) error(404, 'Not found');
	const repo = forUser(locals.supabase, user.id);
	const { data, error: err } = await getDailyBriefingMeta(repo, params.date);
	if (err) error(503, '잠시 후 다시 시도해 주세요.');
	if (!data) error(404, 'Not found');
	const mode = parseDetailMode(url.searchParams);
	return {
		title: '브리핑',
		mode,
		briefing: data,
		body: mode === 'detail' ? await readBriefingBody(repo, data) : null
	};
};
