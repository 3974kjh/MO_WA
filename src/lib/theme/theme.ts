/**
 * 테마 3단 토글 로직 (FE-13, H §1-3, DS §2 결정 2)
 * - system: <html>에 data-theme 없음 + localStorage('mowa-theme') 없음 → OS 설정(prefers-color-scheme)
 * - light / dark: data-theme 속성과 저장값으로 덮어씀
 * 순서: 시스템 → 라이트 → 다크 → 시스템
 * DOM·스토리지를 인자로 받아 단위 테스트할 수 있게 한다.
 */
export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mowa-theme';
export const THEME_ATTR = 'data-theme';

export const THEME_LABEL: Record<ThemeMode, string> = {
	system: '기기 설정 따름',
	light: '라이트',
	dark: '다크'
};

const NEXT: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };

export function nextThemeMode(mode: ThemeMode): ThemeMode {
	return NEXT[mode];
}

type ThemeRoot = Pick<Element, 'getAttribute' | 'setAttribute' | 'removeAttribute'>;
type ThemeStorage = Pick<Storage, 'setItem' | 'removeItem'>;

export function readThemeMode(root: ThemeRoot): ThemeMode {
	const t = root.getAttribute(THEME_ATTR);
	return t === 'light' || t === 'dark' ? t : 'system';
}

export function applyThemeMode(mode: ThemeMode, root: ThemeRoot, storage?: ThemeStorage | null) {
	if (mode === 'system') {
		root.removeAttribute(THEME_ATTR);
		try {
			storage?.removeItem(THEME_STORAGE_KEY);
		} catch {
			/* 사파리 비공개 모드 등 저장소 접근 실패는 무시 */
		}
		return;
	}
	root.setAttribute(THEME_ATTR, mode);
	try {
		storage?.setItem(THEME_STORAGE_KEY, mode);
	} catch {
		/* 무시 */
	}
}
