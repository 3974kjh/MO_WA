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

export interface RenderedReport {
	/** 요약(A) 영역 HTML(sanitize 완료). A/B 구분이 없으면 본문 전체 */
	a: string;
	/** 상세 근거(B) 영역 HTML(sanitize 완료). 구분이 없으면 빈 문자열 */
	b: string;
	/** A/B 구분을 찾았는지. false면 요약/상세 토글을 숨긴다(G-11) */
	hasSplit: boolean;
	/** H2·H3 목차 */
	toc: TocItem[];
}

export type ReportMode = 'summary' | 'detail';
