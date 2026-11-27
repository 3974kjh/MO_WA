import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EmptyState from './EmptyState.svelte';

// icons.md #48~53(v1.7.1) + 기존 #23·#36~39: 빈 상태 기호는 Lucide 24 장식 아이콘이고 글자·이모지는 남지 않는다.
const CASES: [string, string][] = [
	['◔', 'chart-pie'],
	['📊', 'chart-column'],
	['📈', 'chart-line'],
	['🎯', 'target'],
	['💼', 'briefcase'],
	['🔑', 'key-round'],
	['✓', 'circle-check'],
	['🔍', 'search-x'],
	['📒', 'notebook'],
	['🗂', 'folder-open'],
	['🗂️', 'folder-open'],
	['🗓', 'calendar-x']
];

describe('EmptyState 아이콘', () => {
	it.each(CASES)('%s → Lucide %s (24, 장식)', (glyph, name) => {
		const { container } = render(EmptyState, { icon: glyph, title: '제목' });
		const svg = container.querySelector('.ico svg');
		expect(svg?.classList.contains(`lucide-${name}`)).toBe(true);
		expect(svg?.getAttribute('width')).toBe('24');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
		expect(svg?.getAttribute('stroke-width')).toBe('1.8');
		expect(container.querySelector('.ico')?.getAttribute('aria-hidden')).toBe('true');
		expect(container.querySelector('.ico')?.textContent?.trim()).toBe('');
	});

	it('대응표에 없는 기호는 글자 그대로 둔다', () => {
		const { container } = render(EmptyState, { icon: '🧾', title: '제목' });
		expect(container.querySelector('.ico svg')).toBeNull();
		expect(container.querySelector('.ico')?.textContent?.trim()).toBe('🧾');
	});
});
