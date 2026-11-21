import type { PageParams } from './pagination';

/** L-8: home briefings are always page 1 / size 5 — ignore `?page` / `?pageSize`. */
export const HOME_BRIEFINGS_PAGE: PageParams = {
	page: 1,
	pageSize: 5,
	offset: 0,
	limit: 5
};
