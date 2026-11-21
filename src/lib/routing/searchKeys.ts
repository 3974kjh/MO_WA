/** 검색 입력 키 처리(SearchBox와 단위 테스트가 함께 쓴다). 한글 조합 중 Enter는 조합 확정용이라 건너뛴다. */
export function shouldFlushOnKey(e: { key: string; isComposing: boolean }): boolean {
	return e.key === 'Enter' && !e.isComposing;
}
