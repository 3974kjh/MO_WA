/**
 * Nit-2: 위험 버튼 빨간 글자·hover (skeleton-overrides.css). 살아남던 변이를 죽인다.
 */
import '../../app.css';
import { describe, expect, it } from 'vitest';

function cssText(): string {
	const out: string[] = [];
	for (const sheet of document.styleSheets) {
		let list: CSSRuleList;
		try {
			list = sheet.cssRules;
		} catch {
			continue;
		}
		for (const r of list) out.push(r.cssText);
	}
	return out.join('\n').replace(/\s+/g, '');
}

describe('위험 버튼 색 (v1.7.2, Nit-2)', () => {
	it('라이트: 글자·테두리 #C7251A, 배경 투명, hover 배경 --color-up-soft(#FCE8E6)', () => {
		document.documentElement.dataset.theme = 'light';
		document.documentElement.classList.remove('dark');
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'btn preset-outlined-error-700-300';
		b.textContent = '거절';
		document.body.appendChild(b);
		try {
			const rest = getComputedStyle(b);
			expect(rest.color).toBe('rgb(199, 37, 26)');
			expect(
				rest.backgroundColor === 'rgba(0, 0, 0, 0)' || rest.backgroundColor === 'transparent'
			).toBe(true);
			const borderOrRing = `${rest.borderColor} ${rest.boxShadow} ${rest.outlineColor}`;
			expect(borderOrRing).toContain('199, 37, 26');

			const css = cssText();
			// 선언이 스타일시트에 있어야 변이를 잡는다(:hover 계산 스타일은 불안정).
			expect(css).toContain('.btn.preset-outlined-error-700-300{color:var(--color-up)');
			expect(css).toContain(
				'.btn.preset-outlined-error-700-300:not(:disabled):hover{background:var(--color-up-soft);}'
			);
			expect(
				getComputedStyle(document.documentElement)
					.getPropertyValue('--color-up-soft')
					.trim()
					.toUpperCase()
			).toBe('#FCE8E6');
		} finally {
			b.remove();
		}
	});
});
