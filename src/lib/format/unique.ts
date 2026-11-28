/**
 * 값 자체를 `{#each … (값)}` 키로 쓰는 목록(태그·종목 코드)의 화면용 중복 제거. 처음 나온 순서를 지킨다.
 * 같은 값이 두 번 들어 있으면 Svelte가 each_key_duplicate로 화면 전체를 멈추므로 렌더 직전에 거른다.
 * 표시용이라 저장값은 바꾸지 않는다(폼은 원래 배열 그대로 보낸다).
 */
export function uniqueValues<T>(list: readonly T[] | null | undefined): T[] {
	return list ? [...new Set(list)] : [];
}
