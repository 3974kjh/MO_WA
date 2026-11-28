/**
 * FE-12 `/realestate` 주소 규칙(순수). `?tab=brief|trend|subs|watch|map`(확정 5탭, 시안 realestate.html과 같은 순서) ·
 * `?c=<단지 id>`. 탭이 없거나 모르는 값이면 첫 탭(오늘 브리핑)이다. 지도 코드는 map 탭일 때만 불러온다.
 */
export type RealestateTab = 'brief' | 'trend' | 'subs' | 'watch' | 'map';

export const RE_TABS: ReadonlyArray<{ id: RealestateTab; label: string }> = [
	{ id: 'brief', label: '오늘 브리핑' },
	{ id: 'trend', label: '시세 동향' },
	{ id: 'subs', label: '청약' },
	{ id: 'watch', label: '관심 단지' },
	{ id: 'map', label: '지도' }
];

/** 단지 자료(지도·관심 단지)를 읽는 탭 */
export const COMPLEX_TABS: ReadonlySet<RealestateTab> = new Set(['watch', 'map']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RealestateQuery {
	tab: RealestateTab;
	/** 처음 고를 단지(형식 밖이면 null) */
	c: string | null;
}

export function parseRealestateQuery(sp: URLSearchParams): RealestateQuery {
	const raw = sp.get('tab');
	const t = RE_TABS.find((x) => x.id === raw);
	const c = sp.get('c');
	return { tab: t?.id ?? 'brief', c: c && UUID_RE.test(c) ? c.toLowerCase() : null };
}
