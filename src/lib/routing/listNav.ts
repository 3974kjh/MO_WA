/**
 * FE-10: 목록 화면의 쿼리 이동 공통부(브리핑·매매일지).
 * 같은 URL이면 이동하지 않고 null, 아니면 goto 약속을 돌려준다.
 */
import { goto } from '$app/navigation';
import { page } from '$app/state';

/** @param base `resolve('/briefings')`처럼 resolve()로 만든 경로 */
export function gotoListSearch(
	base: string,
	search: string,
	replaceState: boolean
): Promise<void> | null {
	if (search === page.url.search) return null;
	// 경로는 호출부가 resolve()로 만들고 여기서는 쿼리만 붙인다.
	// eslint-disable-next-line svelte/no-navigation-without-resolve
	return goto(`${base}${search}`, { replaceState, keepFocus: true, noScroll: true });
}
