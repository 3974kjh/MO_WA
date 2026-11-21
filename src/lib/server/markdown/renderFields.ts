/**
 * 렌더 결과 필드 쓰기 경로 계약(FE-15 후속, FE-04). 의존성 없는 작은 모듈이라 리포지토리 쓰기 경로에서도 가져다 쓴다.
 *
 * `reports.body_blocks`·`toc`는 렌더 파이프라인만 채운다. 클라이언트·봇·MCP가 보낸 리포트 입력에 이 필드가 있으면
 * 이름 변형(대소문자, `_`·`-`·공백, camelCase, 단·복수)까지 모두 지운다(Nit).
 */

/** 대표 이름(문서·테스트용). 실제 판정은 isRenderFieldKey()가 정규화해서 한다 */
export const RENDER_FIELDS = ['body_blocks', 'toc', 'bodyBlocks'] as const;
type RenderField = (typeof RENDER_FIELDS)[number];

/** 정규화한 키(소문자, 영숫자만) 기준 차단 목록 */
const BLOCKED_NORMALIZED = new Set(['bodyblock', 'bodyblocks', 'toc', 'tocs', 'tableofcontents']);

function normalizeKey(k: string): string {
	return k
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

/** `body_blocks`·`BodyBlocks`·`body-blocks`·` toc `·`TOC`·`table_of_contents` 등을 모두 렌더 필드로 본다 */
export function isRenderFieldKey(k: string): boolean {
	return BLOCKED_NORMALIZED.has(normalizeKey(k));
}

/**
 * 쓰기 경로 계약: 외부 입력에서 렌더 결과 필드를 지운다. 리포트 insert·update 경로(reports.repo.ts)는
 * 반드시 이 함수를 거친다(reportsWritePath.spec.ts로 고정).
 */
export function stripRenderFields<T extends Record<string, unknown>>(
	input: T
): Omit<T, RenderField> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(input)) {
		if (isRenderFieldKey(k)) continue;
		// `__proto__` 같은 키가 프로토타입을 바꾸지 않도록 자기 속성으로만 넣는다
		Object.defineProperty(out, k, {
			value: v,
			enumerable: true,
			writable: true,
			configurable: true
		});
	}
	return out as Omit<T, RenderField>;
}
