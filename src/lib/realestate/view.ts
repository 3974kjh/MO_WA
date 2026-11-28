/**
 * FE-12 `/realestate` 주소 규칙(순수). `?tab=brief|trend|subs|watch|map`(확정 5탭) · `?c=<단지 id>`.
 * 지금 열린 탭은 지도 하나라 모르는 값·준비 중 탭은 지도로 그린다(주소는 그대로 둔다 — 303 정리는
 * 다른 탭이 열릴 때 함께 정한다).
 */
export type RealestateTab = 'brief' | 'trend' | 'subs' | 'watch' | 'map';

export const RE_TABS: ReadonlyArray<{ id: RealestateTab; label: string; ready: boolean }> = [
	{ id: 'brief', label: '오늘 브리핑', ready: false },
	{ id: 'trend', label: '시세 동향', ready: false },
	{ id: 'subs', label: '청약', ready: false },
	{ id: 'watch', label: '관심 단지', ready: false },
	{ id: 'map', label: '지도', ready: true }
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RealestateQuery {
	tab: RealestateTab;
	/** 처음 고를 단지(형식 밖이면 null) */
	c: string | null;
}

export function parseRealestateQuery(sp: URLSearchParams): RealestateQuery {
	const raw = sp.get('tab');
	const t = RE_TABS.find((x) => x.id === raw && x.ready);
	const c = sp.get('c');
	return { tab: t?.id ?? 'map', c: c && UUID_RE.test(c) ? c.toLowerCase() : null };
}
