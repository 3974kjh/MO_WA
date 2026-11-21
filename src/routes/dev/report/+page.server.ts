import { renderReport } from '$lib/server/markdown/render';
import { GLOSSARY } from '$lib/content/glossary';
import { largeBriefing, sampleBriefing } from '$lib/fixtures/report';
import type { PageServerLoad } from './$types';

/** /dev/report: FE-15 렌더러 확인용(로컬 개발 전용 — dev 레이아웃이 운영에서 404). 픽스처만 쓴다. */
export const load: PageServerLoad = async ({ parent, url }) => {
	await parent(); // dev 가드(운영 404)를 먼저 통과해야 렌더한다
	const big = url.searchParams.get('size') === 'large';
	const src = big ? largeBriefing() : sampleBriefing;
	const t0 = performance.now();
	const report = renderReport(src, { glossary: GLOSSARY });
	return { report, ms: performance.now() - t0, bytes: new TextEncoder().encode(src).length };
};
