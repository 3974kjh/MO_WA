/**
 * 이동 중 셸 표시(사이드바 활성 항목·상단바 제목·뒤로)를 목적지 기준으로 바꾸는 순수 함수.
 * 로딩 패널은 경로가 바뀌는 이동에서만 쓴다(필터·쪽 바꾸기 같은 쿼리만 바뀌는 이동은 제외).
 */
import {
	ALL_NAV,
	backHrefFromPath,
	sectionFromPath,
	type SectionId
} from '$lib/components/layout/nav';

export interface NavLike {
	from?: { url: URL } | null;
	to?: { url: URL; route: { id: string | null } } | null;
	type?: string | null;
}

/** 경로가 바뀌는 앱 안 이동인가 (패널 대상) */
export function isMenuNavigation(nav: NavLike): boolean {
	if (!nav.to || !nav.from) return false;
	if (nav.type === 'leave' || nav.type === 'form') return false;
	return nav.to.url.pathname !== nav.from.url.pathname;
}

export interface NavChrome {
	current: SectionId | null;
	title: string | undefined;
	backHref: string | null | undefined;
}

/** 목적지 경로의 셸 표시. 상세 제목(종목명 등)은 데이터가 와야 알므로 섹션 이름을 쓴다. */
export function chromeForPath(pathname: string): NavChrome {
	const current = sectionFromPath(pathname);
	const title = ALL_NAV.find((n) => n.id === current)?.label;
	// 분석 리포트의 '뒤로'는 화면이 정한다(들어온 종목). 아직 모르면 비운다.
	const backHref = pathname.startsWith('/analyses/') ? null : backHrefFromPath(pathname);
	return { current, title, backHref };
}
