/**
 * 내비게이션 정의 (FE-01, H §2·§3, DS §5·§6, 시안 shared/shell.js NAV)
 * 1차 = 홈·브리핑·포트폴리오·매매일지 / '투자'(v1.6.2 B안) = 종목·부동산 / 곧 열려요 = 투자 원칙(disabled '준비 중')
 * FE-11(PM이 전한 사용자 결정 2026-11-28): 종목 열림, 설정 열림.
 * FE-12 골격(PM이 전한 사용자 결정 2026-11-28 21:48): 부동산 열림(지금은 지도 탭만, 나머지 탭은 화면 안에서 '준비 중').
 */
export type SectionId =
	| 'dashboard'
	| 'briefings'
	| 'portfolio'
	| 'journal'
	| 'stocks'
	| 'realestate'
	| 'rules'
	| 'archive'
	| 'settings';

export type NavIcon =
	| 'house'
	| 'file-text'
	| 'chart-pie'
	| 'notebook'
	| 'chart-line'
	| 'building'
	| 'shield'
	| 'archive'
	| 'settings';

export interface NavEntry {
	id: SectionId;
	label: string;
	icon: NavIcon;
	/** 없으면 disabled('준비 중') */
	href?:
		| '/'
		| '/briefings'
		| '/portfolio'
		| '/journal'
		| '/archive'
		| '/settings'
		| '/stocks'
		| '/realestate';
	/** 확인 대기 pill을 붙이는 항목 */
	pendingBadge?: boolean;
}

export const PRIMARY_NAV: NavEntry[] = [
	{ id: 'dashboard', label: '홈', icon: 'house', href: '/' },
	{ id: 'briefings', label: '브리핑', icon: 'file-text', href: '/briefings' },
	{
		id: 'portfolio',
		label: '포트폴리오',
		icon: 'chart-pie',
		href: '/portfolio',
		pendingBadge: true
	},
	{ id: 'journal', label: '매매일지', icon: 'notebook', href: '/journal' }
];

/**
 * '투자' 묶음(v1.6.2 B안): PC 사이드바 접기 · 태블릿 레일 플라이아웃 · 모바일 더보기가 같은 목록을 쓴다.
 * 사이드바 기본 목록(PRIMARY_NAV)에는 넣지 않는다. 기업분석은 메뉴가 없다(종목 상세에서 들어감).
 */
export const INVEST_NAV: NavEntry[] = [
	{ id: 'stocks', label: '종목', icon: 'chart-line', href: '/stocks' },
	{ id: 'realestate', label: '부동산', icon: 'building', href: '/realestate' }
];

/** '곧 열려요' */
export const SOON_NAV: NavEntry[] = [{ id: 'rules', label: '투자 원칙', icon: 'shield' }];

/** '관리' 그룹(디자인 v1.1: 사이드바 하단 '관리' / 더보기 시트 '관리' 그룹). */
export const ACCOUNT_NAV: NavEntry[] = [
	{ id: 'archive', label: '보관함', icon: 'archive', href: '/archive' },
	{ id: 'settings', label: '설정', icon: 'settings', href: '/settings' }
];

export const ALL_NAV: NavEntry[] = [...PRIMARY_NAV, ...INVEST_NAV, ...SOON_NAV, ...ACCOUNT_NAV];

/**
 * 로그아웃 폼 액션 경로(전용 라우트 src/routes/logout, 기본 액션).
 * 셸·더보기 시트·홈이 모두 이 값을 쓴다. `/`의 위치와 무관하게 어느 화면에서도 같은 경로다.
 */
export const LOGOUT_PATH = '/logout' as const;

/** 경로 → 현재 섹션. 상세 경로(/briefings/2026-11-20)도 상위 섹션으로 본다. */
export function sectionFromPath(pathname: string): SectionId | null {
	if (pathname === '/') return 'dashboard';
	const seg = pathname.split('/')[1];
	// 분석 리포트(/analyses/[slug])는 종목 아래로 본다(메뉴 없음, DS §6).
	if (seg === 'analyses') return 'stocks';
	return ALL_NAV.find((n) => n.id === seg)?.id ?? null;
}

/** 상세 화면이면 돌아갈 상위 경로(모바일 상단바 '뒤로'). 섹션 루트면 null */
export function backHrefFromPath(pathname: string): string | null {
	const parts = pathname.split('/').filter(Boolean);
	if (parts.length < 2) return null;
	return '/' + parts.slice(0, -1).join('/');
}
