/** Server-side pagination helpers (BE-11). */

export type PageParams = {
	page: number;
	pageSize: number;
	offset: number;
	limit: number;
};

export function parsePageParams(
	url: URL,
	opts: { defaultSize?: number; maxSize?: number } = {}
): PageParams {
	const defaultSize = opts.defaultSize ?? 20;
	const maxSize = opts.maxSize ?? 100;
	const rawPage = Number(url.searchParams.get('page') ?? '1');
	const rawSize = Number(url.searchParams.get('pageSize') ?? String(defaultSize));
	const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
	const pageSize =
		Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(Math.floor(rawSize), maxSize) : defaultSize;
	const offset = (page - 1) * pageSize;
	return { page, pageSize, offset, limit: pageSize };
}

export type PageResult<T> = {
	items: T[];
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
};

export function toPageResult<T>(items: T[], total: number, params: PageParams): PageResult<T> {
	const totalPages = total === 0 ? 0 : Math.ceil(total / params.pageSize);
	return {
		items,
		page: params.page,
		pageSize: params.pageSize,
		total,
		totalPages
	};
}
