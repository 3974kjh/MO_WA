/**
 * 활동 기록 필터 줄 크기 (디자이너 16:27): '적용' 보이는 높이 ≥ 40(모바일 주요 버튼 44), '필터 초기화' 터치 영역 ≥ 40.
 * 실제 스타일(app.css)을 불러 브라우저에서 잰다.
 */
import '../../../../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Page from './+page.svelte';

const data = {
	title: '활동 기록',
	filter: { bot: '', tool: 'get_report', result: '', warn: false, rule: '' },
	rows: [],
	truncated: false,
	ruleIdCounts: {},
	bots: [],
	error: null
} as never;

const submit = (c: Element) =>
	[...c.querySelectorAll<HTMLButtonElement>('form button[type="submit"]')].find((b) =>
		b.textContent?.includes('적용')
	)!;
const reset = (c: Element) => c.querySelector<HTMLElement>('[data-testid="audit-reset"]')!;

afterEach(async () => {
	await page.viewport(414, 896);
});

describe('활동 기록 필터 버튼·초기화 링크 크기', () => {
	it('≥640: 적용 버튼 보이는 높이 40, 초기화 링크 높이 ≥ 40, 둘의 세로 중심이 같다', async () => {
		await page.viewport(768, 900);
		const { container } = render(Page, { data });
		const b = submit(container).getBoundingClientRect();
		const r = reset(container).getBoundingClientRect();
		expect(b.height).toBe(40);
		expect(r.height).toBeGreaterThanOrEqual(40);
		expect(Math.abs(b.top + b.height / 2 - (r.top + r.height / 2))).toBeLessThanOrEqual(1);
	});

	it('<640: 적용은 모바일 주요 버튼 44, 초기화 링크 ≥ 40', async () => {
		await page.viewport(390, 844);
		const { container } = render(Page, { data });
		expect(submit(container).getBoundingClientRect().height).toBe(44);
		expect(reset(container).getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
	});

	it('초기화 링크는 글자 옆 가로 여유도 있어 눌러지는 폭이 40 이상', async () => {
		await page.viewport(390, 844);
		const { container } = render(Page, { data });
		expect(reset(container).getBoundingClientRect().width).toBeGreaterThanOrEqual(40);
	});
});
