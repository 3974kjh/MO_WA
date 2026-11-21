import { browser } from '$app/environment';
import { applyThemeMode, nextThemeMode, readThemeMode, type ThemeMode } from './theme';

/** 화면 전체에서 하나의 테마 상태를 공유한다(상단바 버튼·더보기 시트·설정이 같은 값을 본다). */
class ThemeState {
	mode = $state<ThemeMode>('system');

	/** theme-init 스크립트가 이미 건 속성을 읽어 동기화한다(하이드레이션 후 1회). */
	sync() {
		if (browser) this.mode = readThemeMode(document.documentElement);
	}

	set(mode: ThemeMode) {
		this.mode = mode;
		if (browser) applyThemeMode(mode, document.documentElement, window.localStorage);
	}

	cycle() {
		this.set(nextThemeMode(this.mode));
	}
}

export const themeState = new ThemeState();
