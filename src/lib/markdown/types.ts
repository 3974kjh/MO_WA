/**
 * 리포트 렌더 결과 타입 (FE-15). 렌더러는 서버 전용($lib/server/markdown/render.ts)이고,
 * 화면 컴포넌트는 이 타입만 가져다 쓴다(서버 모듈을 브라우저 번들에 넣지 않기 위해 분리).
 */
export type ReportPart = 'A' | 'B';

export interface TocItem {
	id: string;
	text: string;
	level: 2 | 3;
	part: ReportPart;
}

/**
 * sanitize를 거친 HTML(Low-4). 서버 렌더러($lib/server/markdown/render.ts)만 만든다.
 * 일반 string은 이 타입에 넣을 수 없어, `{@html}`(ReportView)에 다른 출처 문자열이 들어가면 타입 검사에서 막힌다.
 */
export type SanitizedHtml = string & { readonly __brand: 'SanitizedHtml' };

export interface RenderedReport {
	/** 요약(A) 영역 HTML(sanitize 완료). A/B 구분이 없으면 본문 전체 */
	a: SanitizedHtml;
	/** 상세 근거(B) 영역 HTML(sanitize 완료). 구분이 없으면 빈 문자열 */
	b: SanitizedHtml;
	/** A/B 구분을 찾았는지. false면 요약/상세 토글을 숨긴다(G-11) */
	hasSplit: boolean;
	/** H2·H3 목차 */
	toc: TocItem[];
	/** 고정 문구로 대체한 경우 그 이유(상한 초과·렌더 실패). 정상 렌더면 없음 */
	fallback?: 'too-large' | 'render-error';
}

export type ReportMode = 'summary' | 'detail';
