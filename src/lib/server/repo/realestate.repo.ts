/**
 * FE-12 부동산 화면 읽기(사용자 세션 RLS, owner 조건 강제). 쓰기 경로 없음.
 * 새 RPC·권한·마이그레이션 없이 기존 `re_complexes`·`re_complex_snapshots`만 읽는다(필요 열만).
 */
import type { ComplexRow, SnapshotRow } from '$lib/maps/points';
import type { RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';

type Res<T> = Promise<{ data: T; error: Error | null }>;

/** 지도·목록에 쓰는 열. 역할은 meta 전체가 아니라 meta->i7_roles만 받는다. */
export const RE_COMPLEX_MAP_COLUMNS =
	'id, name, sido, sigungu, address, lat, lng, households, built_year, main_type, total_score, rating, is_target, roles:meta->i7_roles';

/** 보관 안 된 단지(지도 탭). */
export async function listReComplexesForMap(repo: RepoClient): Res<ComplexRow[]> {
	let q = fromRepo(repo, 're_complexes')
		.select(RE_COMPLEX_MAP_COLUMNS)
		.is('archived_at', null)
		.order('name', { ascending: true });
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q;
	return { data: (data ?? []) as unknown as ComplexRow[], error: error as Error | null };
}

/**
 * 최근 스냅샷을 최신 순으로 최대 이만큼 읽고 단지마다 첫 행을 쓴다(호출부 latestSnapshots).
 * 하루 한 번 97단지 기준 약 열흘치 — 그보다 오래 갱신이 없는 단지는 가격 없이 보인다.
 */
export const RE_SNAPSHOT_SCAN_MAX = 1000;

export async function listRecentComplexSnapshots(
	repo: RepoClient,
	complexIds: string[]
): Res<SnapshotRow[]> {
	if (complexIds.length === 0) return { data: [], error: null };
	let q = fromRepo(repo, 're_complex_snapshots')
		.select('complex_id, as_of, med_price')
		.in('complex_id', complexIds)
		.order('as_of', { ascending: false })
		.limit(RE_SNAPSHOT_SCAN_MAX);
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q;
	return { data: (data ?? []) as SnapshotRow[], error: error as Error | null };
}
