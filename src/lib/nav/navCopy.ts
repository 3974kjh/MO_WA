/**
 * 메뉴 이동 로딩 문구 (라우트별). 단계 0 → 1 → 2 순서로 바 위 문구가 바뀐다.
 *  0: 데이터 요청 중 / 1: 응답이 길어질 때 보조 확인 문구 / 2: 응답을 받고 화면을 구성하는 중.
 * 문구는 그 라우트 load가 실제로 읽는 것만 말한다(없는 일을 한다고 하지 않는다).
 * 라우트 id는 SvelteKit `to.route.id`에서 `/(app)` 그룹 접두를 뗀 값이다.
 */
export type NavSteps = readonly [string, string, string];
export interface NavCopy {
	/** 목적지 화면 이름(바 위 작은 제목) */
	name: string;
	steps: NavSteps;
}

const BUILD = '화면 구성 중';

/** 이동이 끝나 게이지가 100%를 채우는 동안(완료 연출) 바 위 문구 */
export const NAV_DONE_TEXT = '준비됐어요';

const journal: NavCopy = {
	name: '매매일지',
	steps: ['매매일지 불러오는 중', '연결된 종목·작성자 확인 중', BUILD]
};
const stock: NavCopy = {
	name: '종목',
	steps: ['종목 정보 불러오는 중', '시세·리포트·일지 확인 중', BUILD]
};
const TABLE: Record<string, NavCopy> = {
	'/': {
		name: '홈',
		steps: ['오늘의 요약을 불러오는 중', '보유 종목·시세 기준 시각 확인 중', BUILD]
	},
	'/briefings': {
		name: '브리핑',
		steps: ['브리핑 목록 불러오는 중', '코스피 등락 함께 확인 중', BUILD]
	},
	'/briefings/[date]': {
		name: '브리핑',
		steps: ['브리핑을 불러오는 중', '본문 확인 중', BUILD]
	},
	'/portfolio': {
		name: '포트폴리오',
		steps: ['보유 종목 불러오는 중', '확인 대기·시세 기준 시각 확인 중', BUILD]
	},
	'/journal': journal,
	'/journal/[id]': journal,
	'/stocks': {
		name: '종목',
		steps: ['보유 종목 불러오는 중', '시세 기준 시각 확인 중', BUILD]
	},
	'/stocks/[ticker]': stock,
	'/analyses/[slug]': {
		name: '분석 리포트',
		steps: ['분석 리포트 불러오는 중', '본문 확인 중', BUILD]
	},
	'/archive': {
		name: '보관함',
		steps: ['보관한 항목 불러오는 중', '목록 확인 중', BUILD]
	},
	'/settings': {
		name: '설정',
		steps: ['설정 불러오는 중', '봇 키·활동 기록 확인 중', BUILD]
	},
	'/settings/audit': {
		name: '감사 기록',
		steps: ['감사 기록 불러오는 중', '봇·규칙 목록 확인 중', BUILD]
	}
};

export const FALLBACK_COPY: NavCopy = {
	name: '화면',
	steps: ['화면 데이터 준비 중', '내용 확인 중', BUILD]
};

const GROUP = '/(app)';

export function navCopyFor(routeId: string | null | undefined): NavCopy {
	if (!routeId) return FALLBACK_COPY;
	const id = routeId.startsWith(GROUP) ? routeId.slice(GROUP.length) || '/' : routeId;
	return TABLE[id] ?? FALLBACK_COPY;
}

export const NAV_COPY_ROUTES = Object.keys(TABLE);
