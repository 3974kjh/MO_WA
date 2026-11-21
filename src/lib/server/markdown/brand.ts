/**
 * SanitizedHtml 브랜드를 붙이는 유일한 곳(Low-4). 공개 캐스트가 아니다.
 * 이 모듈은 render.ts(sanitize 직후)와 cacheRead.ts(렌더 파이프라인이 기록한 값의 형태·키 검사 직후)만
 * import할 수 있다. brand.spec.ts가 src 전체에서 import 위치를 검사한다.
 */
import type { SanitizedHtml } from '$lib/markdown/types';

export function asSanitized(html: string): SanitizedHtml {
	return html as SanitizedHtml;
}
