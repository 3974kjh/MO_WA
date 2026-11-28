/**
 * 부동산 지도(FE-12 ⑤): DB 행 → 화면 모델(순수 함수). 읽기 전용이고 값을 고치지 않는다.
 * - 좌표는 R-VAL-M07 범위(lat 33~39, lng 124~132) 안의 유한수만 쓴다. 범위 밖·빈 값이면 위치 없음으로 보고
 *   지도에 찍지 않는다(추측 금지). 목록에는 '위치 정보 없음'으로 남긴다.
 * - 구분(tier, 디자이너 명세 realestate-map §3-1): 최우선(봇이 준 별점 `rating`이 TOP_RATING 이상인 타깃) ·
 *   일반(is_target) · 후보(그 밖) · 참고(meta.i7_roles에 secondary, 점수 없음). 내부 키 target = 화면 이름 '일반'.
 *   화면 쪽 총점 규칙은 없다 — 총점은 핀에 보일 뿐 등급 기준이 아니다(PM 결정 2026-11-28 22:17 KST).
 * - 금액은 만 원 정수 그대로 싣고, 화면이 ×10,000 뒤 formatWon()으로만 표시한다.
 * 계획: /workspace/mo_wa/naver-map/PLAN.md §3-3·§3-4.
 */

export type ComplexTier = 'top' | 'target' | 'ref' | 'cand';

/** 지도·범례·목록 순서(앞이 먼저). */
export const TIER_ORDER: readonly ComplexTier[] = ['top', 'target', 'cand', 'ref'];

export const TIER_LABEL: Record<ComplexTier, string> = {
	top: '최우선',
	target: '일반',
	ref: '참고',
	cand: '후보'
};

/**
 * 최우선 기준: 봇(house-signal 계열)이 `re_complexes.rating`에 기록한 별점 4.0 이상(PLAN §3-4 '별 4.0↑').
 * 스키마에 '최우선' 등급을 직접 담은 열은 없어 봇 별점을 그대로 읽는다(계산·보정 없음).
 * `null`로 바꾸면 어떤 단지도 최우선이 아니다(PM이 별점 기준을 원치 않을 때 한 줄로 끈다).
 * 출처: house-signal 지도 등급 규칙 dashboard/map_block.py(TIERS, `tier = 'p' if t['stars'] >= 4.0`)와 같다.
 * 타깃 중 별 4.0 이상 = 최우선 타깃이므로 봇 등급 그대로다. PM 확정(2026-11-28 23:04 KST).
 */
export const TOP_RATING: number | null = 4;

export const LAT_RANGE = [33, 39] as const;
export const LNG_RANGE = [124, 132] as const;

/** `re_complexes`에서 읽는 열(필요 열만). */
export interface ComplexRow {
	id: string;
	name: string;
	sido: string | null;
	sigungu: string | null;
	address: string | null;
	lat: number | string | null;
	lng: number | string | null;
	households: number | null;
	built_year: number | null;
	main_type: string | null;
	total_score: number | string | null;
	rating: number | string | null;
	is_target: boolean | null;
	roles?: unknown;
}

/** `re_complex_snapshots`에서 읽는 열. */
export interface SnapshotRow {
	complex_id: string;
	as_of: string;
	med_price: number | null;
}

export interface ComplexItem {
	id: string;
	/** 목록 순서(총점 높은 순, 1부터). 지도 핀 번호와 같다 */
	rank: number;
	name: string;
	/** '경기도 파주시' */
	region: string;
	address: string | null;
	lat: number | null;
	lng: number | null;
	households: number | null;
	builtYear: number | null;
	mainType: string | null;
	score: number | null;
	rating: number | null;
	tier: ComplexTier;
	/** 최근 실거래 중앙값(만 원 정수) */
	medPrice: number | null;
	priceAsOf: string | null;
	/** 네이버 지도 검색 링크(키 불필요) */
	naverUrl: string;
}

export type LocatedItem = ComplexItem & { lat: number; lng: number };

export interface ComplexMapModel {
	items: ComplexItem[];
	located: number;
	missing: number;
	/** 가장 최근 가격 기준일(없으면 null) */
	priceAsOf: string | null;
}

function toNum(v: unknown): number | null {
	if (typeof v === 'number') return Number.isFinite(v) ? v : null;
	if (typeof v === 'string' && v.trim() !== '') {
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

/** 범위 안 좌표만 돌려준다. 하나라도 빠지거나 범위 밖이면 null(둘 다). */
export function validCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
	const a = toNum(lat);
	const o = toNum(lng);
	if (a == null || o == null) return null;
	if (a < LAT_RANGE[0] || a > LAT_RANGE[1] || o < LNG_RANGE[0] || o > LNG_RANGE[1]) return null;
	return { lat: a, lng: o };
}

function roleList(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function tierOf(row: Pick<ComplexRow, 'is_target' | 'rating' | 'roles'>): ComplexTier {
	if (row.is_target) {
		const rating = toNum(row.rating);
		return TOP_RATING != null && rating != null && rating >= TOP_RATING ? 'top' : 'target';
	}
	if (roleList(row.roles).includes('secondary')) return 'ref';
	return 'cand';
}

const NAVER_SEARCH = 'https://map.naver.com/p/search/';

/** 네이버 지도 검색 링크. 이름과 시군구를 검색어로 쓴다(주소 대신 — 같은 이름 단지 구분). */
export function naverSearchUrl(name: string, sigungu: string | null): string {
	const q = [name.trim(), sigungu?.trim()].filter(Boolean).join(' ');
	return NAVER_SEARCH + encodeURIComponent(q);
}

/** 외부 링크는 네이버 지도만 허용한다(PLAN §4-3). */
export function isAllowedMapLink(href: string): boolean {
	return href.startsWith(NAVER_SEARCH);
}

/** 단지별 최신 스냅샷(as_of 가장 늦은 행). */
export function latestSnapshots(rows: readonly SnapshotRow[]): Map<string, SnapshotRow> {
	const out = new Map<string, SnapshotRow>();
	for (const r of rows) {
		const prev = out.get(r.complex_id);
		if (!prev || r.as_of > prev.as_of) out.set(r.complex_id, r);
	}
	return out;
}

function compare(a: ComplexItem, b: ComplexItem): number {
	// 시안(v1.7.8): 등급(최우선→관심→후보→참고) 순, 같은 등급 안에서는 총점 높은 순
	const ta = TIER_ORDER.indexOf(a.tier);
	const tb = TIER_ORDER.indexOf(b.tier);
	if (ta !== tb) return ta - tb;
	const sa = a.score ?? -1;
	const sb = b.score ?? -1;
	if (sa !== sb) return sb - sa;
	return a.name.localeCompare(b.name, 'ko');
}

export function buildComplexMapModel(
	rows: readonly ComplexRow[],
	snapshots: readonly SnapshotRow[] = []
): ComplexMapModel {
	const snap = latestSnapshots(snapshots);
	const items = rows.map((r): ComplexItem => {
		const c = validCoord(r.lat, r.lng);
		const s = snap.get(r.id);
		const med = s ? toNum(s.med_price) : null;
		return {
			id: r.id,
			rank: 0,
			name: r.name,
			region: [r.sido, r.sigungu].filter(Boolean).join(' '),
			address: r.address,
			lat: c?.lat ?? null,
			lng: c?.lng ?? null,
			households: toNum(r.households),
			builtYear: toNum(r.built_year),
			mainType: r.main_type,
			score: toNum(r.total_score),
			rating: toNum(r.rating),
			tier: tierOf(r),
			medPrice: med != null && Number.isInteger(med) && med > 0 ? med : null,
			priceAsOf: s?.as_of ?? null,
			naverUrl: naverSearchUrl(r.name, r.sigungu)
		};
	});
	items.sort(compare);
	items.forEach((it, i) => (it.rank = i + 1));
	const located = items.filter(isLocated).length;
	const priceAsOf = items.reduce<string | null>(
		(m, it) => (it.priceAsOf && (!m || it.priceAsOf > m) ? it.priceAsOf : m),
		null
	);
	return { items, located, missing: items.length - located, priceAsOf };
}

export function isLocated(it: ComplexItem): it is LocatedItem {
	return it.lat != null && it.lng != null;
}

/** 같은 위치(소수 4자리, 약 10m) 묶음 키 */
export function coordKey(lat: number, lng: number): string {
	return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}
