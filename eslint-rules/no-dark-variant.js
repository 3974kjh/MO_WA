/**
 * G-14: Tailwind `dark:` 변형 사용 금지.
 * tokens.css의 `@custom-variant dark`는 data-theme="dark"에서만 켜지고, 시스템 다크(속성 없음)에서는 동작하지 않는다.
 * 테마별 색은 토큰(var(--color-*) / bg-surface 등)만으로 처리한다.
 */

/** `dark:` 뒤에 유틸리티가 바로 붙는 경우만 잡는다(`{ dark: 'x' }` 같은 객체 키는 제외). */
export const DARK_VARIANT_RE = /(?<![\w-])dark:(?=[\w[!(@*-])/g;

/** @type {import('eslint').Rule.RuleModule} */
export const noDarkVariant = {
	meta: {
		type: 'problem',
		docs: { description: 'Tailwind `dark:` 변형 금지(G-14). 디자인 토큰만 쓴다.' },
		messages: {
			noDark:
				'`dark:` 유틸리티는 금지입니다(G-14). 시스템 다크에서 동작하지 않으니 디자인 토큰(var(--color-*))만 쓰세요.'
		},
		schema: []
	},
	create(context) {
		const sourceCode = context.sourceCode;
		return {
			Program() {
				const text = sourceCode.text;
				for (const m of text.matchAll(DARK_VARIANT_RE)) {
					const start = sourceCode.getLocFromIndex(m.index);
					const end = sourceCode.getLocFromIndex(m.index + m[0].length);
					context.report({ loc: { start, end }, messageId: 'noDark' });
				}
			}
		};
	}
};

export default { rules: { 'no-dark-variant': noDarkVariant } };
