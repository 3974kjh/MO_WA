import type { PageParams } from './pagination';

/** L-8: home briefings are always page 1 / size 5 — ignore `?page` / `?pageSize`. */
export const HOME_BRIEFINGS_PAGE: PageParams = {
	page: 1,
	pageSize: 5,
	offset: 0,
	limit: 5
};

/** FE-03 홈 '확인 대기' 카드: pending + on_hold 최신 5건(건수 pill은 countPendingProposals). */
export const HOME_QUEUE_PAGE: PageParams = {
	page: 1,
	pageSize: 5,
	offset: 0,
	limit: 5
};

/** FE-03 홈 '코스피 추이': 최근 기록 30개(기록된 날만). */
export const HOME_SERIES_DAYS = 30;
