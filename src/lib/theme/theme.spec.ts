import { describe, expect, it } from 'vitest';
import {
	applyThemeMode,
	nextThemeMode,
	readThemeMode,
	THEME_ATTR,
	THEME_STORAGE_KEY,
	type ThemeMode
} from './theme';

function fakeRoot() {
	const attrs = new Map<string, string>();
	return {
		attrs,
		getAttribute: (k: string) => attrs.get(k) ?? null,
		setAttribute: (k: string, v: string) => void attrs.set(k, v),
		removeAttribute: (k: string) => void attrs.delete(k)
	};
}
function fakeStorage() {
	const m = new Map<string, string>();
	return {
		m,
		setItem: (k: string, v: string) => void m.set(k, v),
		removeItem: (k: string) => void m.delete(k)
	};
}

describe('FE-13 테마 3단 토글', () => {
	it('시스템 → 라이트 → 다크 → 시스템 순서로 돈다', () => {
		const seq: ThemeMode[] = ['system'];
		for (let i = 0; i < 3; i++) seq.push(nextThemeMode(seq[seq.length - 1]));
		expect(seq).toEqual(['system', 'light', 'dark', 'system']);
	});

	it('라이트·다크는 data-theme와 localStorage(mowa-theme)를 쓴다', () => {
		const root = fakeRoot();
		const st = fakeStorage();
		applyThemeMode('dark', root, st);
		expect(root.attrs.get(THEME_ATTR)).toBe('dark');
		expect(st.m.get(THEME_STORAGE_KEY)).toBe('dark');
		expect(readThemeMode(root)).toBe('dark');
		applyThemeMode('light', root, st);
		expect(root.attrs.get(THEME_ATTR)).toBe('light');
		expect(st.m.get(THEME_STORAGE_KEY)).toBe('light');
	});

	it('시스템으로 돌리면 속성과 저장값을 모두 지운다', () => {
		const root = fakeRoot();
		const st = fakeStorage();
		applyThemeMode('dark', root, st);
		applyThemeMode('system', root, st);
		expect(root.attrs.has(THEME_ATTR)).toBe(false);
		expect(st.m.has(THEME_STORAGE_KEY)).toBe(false);
		expect(readThemeMode(root)).toBe('system');
	});

	it('알 수 없는 속성 값은 시스템으로 읽는다', () => {
		const root = fakeRoot();
		root.setAttribute(THEME_ATTR, 'paper');
		expect(readThemeMode(root)).toBe('system');
	});

	it('저장소 접근이 실패해도 속성은 바뀐다', () => {
		const root = fakeRoot();
		const broken = {
			setItem: () => {
				throw new Error('denied');
			},
			removeItem: () => {
				throw new Error('denied');
			}
		};
		applyThemeMode('light', root, broken);
		expect(readThemeMode(root)).toBe('light');
	});
});
