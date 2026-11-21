import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';

import Page from './+page.svelte';

const BOT = '11111111-1111-4111-8111-111111111111';
const row = (id: number, over: Record<string, unknown> = {}) => ({
	id,
	created_at: '2026-11-20T03:00:00Z',
	actor_type: 'bot',
	bot_client_id: BOT,
	tool: `dummy.tool${id}`,
	result: 'ok',
	error_code: null,
	rule_ids: [],
	args_preview: { memo: '더미 인자' },
	duration_ms: 12,
	...over
});
function makeData(over: Record<string, unknown> = {}) {
	return {
		title: '활동 기록',
		filter: { bot: '', tool: '', result: '', warn: false, rule: '' },
		rows: [row(1), row(2, { result: 'denied', rule_ids: ['R-VAL-T05'] })],
		truncated: false,
		ruleIdCounts: { 'R-VAL-T05': 3 },
		bots: [{ id: BOT, name: '더미봇' }],
		error: null,
		...over
	} as never;
}
const text = (el: Element | null | undefined) => el?.textContent ?? '';

beforeEach(() => {
	document.body.style.overflow = '';
});

describe('FE-09 활동 기록 화면', () => {
	it('열·봇 이름·결과 라벨·경고 건수, 읽기 전용(폼은 GET 필터뿐)', () => {
		const { container } = render(Page, { data: makeData() });
		expect([...container.querySelectorAll('thead th')].map((t) => text(t).trim())).toEqual([
			'시각',
			'봇',
			'툴',
			'결과',
			'경고',
			'상세'
		]);
		const body = text(container.querySelector('tbody'));
		expect(body).toContain('더미봇');
		expect(body).toContain('거부됨');
		expect(body).toContain('1건');
		const forms = [...container.querySelectorAll('form')];
		expect(forms).toHaveLength(1);
		expect(forms[0]!.method).toBe('get');
	});

	it('WARN 규칙별 건수를 보여 주고 규칙 필터 링크가 된다', () => {
		const { container } = render(Page, { data: makeData() });
		const a = container.querySelector('[data-testid="audit-rule-counts"] a') as HTMLAnchorElement;
		expect(text(a)).toContain('R-VAL-T05');
		expect(text(a)).toContain('3');
		expect(a.getAttribute('href')).toContain('rule=R-VAL-T05');
	});

	it('잘림이면 안내 배너', () => {
		const { container } = render(Page, { data: makeData({ truncated: true }) });
		expect(text(container)).toContain('최근 기록 일부만');
		const none = render(Page, { data: makeData({ truncated: false }) });
		expect(text(none.container)).not.toContain('최근 기록 일부만');
	});

	it('필터가 걸린 빈 결과는 초기화 링크', () => {
		const { container } = render(Page, {
			data: makeData({
				rows: [],
				filter: { bot: '', tool: '', result: 'error', warn: false, rule: '' }
			})
		});
		expect(text(container)).toContain('조건에 맞는 기록이 없어요');
		expect(container.querySelector('[data-testid="audit-reset"]')).toBeTruthy();
		expect(container.querySelector('table')).toBeNull();
	});

	it('상세 시트에 args_preview를 보여 준다', () => {
		const { container } = render(Page, { data: makeData() });
		(container.querySelector('[data-action="audit-open"]') as HTMLButtonElement).click();
		flushSync();
		expect(text(document.querySelector('[data-testid="audit-args"]'))).toContain('더미 인자');
	});
});
