import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/** /dev/* 는 로컬 개발 전용(FE-02 /dev/components, FE-01 /dev/shell). 운영 빌드에서는 404. */
export const load: LayoutServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
