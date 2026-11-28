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

	it('규칙 칩 숫자는 안내 문구와 같이 ko-KR 천 단위로 찍힌다(20000 → 20,000)', () => {
		const { container } = render(Page, {
			data: makeData({ ruleIdCounts: { 'R-VAL-T05': 20000 }, ruleIdCountsLimit: 20000 })
		});
		const num = container.querySelector('[data-testid="audit-rule-counts"] .num');
		expect(text(num)).toBe('20,000');
		expect(text(num)).not.toBe('20000');
	});

	it('규칙별 건수가 상한에서 잘렸으면 센 범위를 알리고, 아니면 안내가 없다', () => {
		const a = render(Page, { data: makeData({ ruleIdCountsLimit: 20000 }) });
		expect(
			text(a.container.querySelector('[data-testid="audit-rule-counts-cut"]')).replace(/\s+/g, ' ')
		).toContain('20,000건까지만 센 값');
		a.unmount();
		const b = render(Page, { data: makeData({ ruleIdCountsLimit: null }) });
		expect(b.container.querySelector('[data-testid="audit-rule-counts-cut"]')).toBeNull();
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
		const svg = container.querySelector('.ico svg');
		expect(svg?.classList.contains('lucide-search-x')).toBe(true);
		expect(svg?.getAttribute('width')).toBe('24');
	});

	it('필터 없는 빈 목록은 scroll-text 아이콘과 「아직 활동 기록이 없어요」(icons.md #54)', () => {
		const { container } = render(Page, { data: makeData({ rows: [] }) });
		expect(text(container)).toContain('아직 활동 기록이 없어요');
		expect(text(container)).not.toContain('조건에 맞는 기록이 없어요');
		const svg = container.querySelector('.ico svg');
		expect(svg?.classList.contains('lucide-scroll-text')).toBe(true);
		expect(svg?.getAttribute('width')).toBe('24');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});

	it('상세 시트에 args_preview를 보여 준다', () => {
		const { container } = render(Page, { data: makeData() });
		(container.querySelector('[data-action="audit-open"]') as HTMLButtonElement).click();
		flushSync();
		expect(text(document.querySelector('[data-testid="audit-args"]'))).toContain('더미 인자');
		expect(document.querySelector('[data-testid="audit-args-cut"]')).toBeNull();
		const args = document.querySelector('[data-testid="audit-args"]');
		expect(text(document.getElementById('audit-args-lbl')).trim()).toBe('보낸 내용 미리보기');
		expect(args?.closest('[data-testid="audit-args-wrap"]')?.previousElementSibling).toBe(
			document.getElementById('audit-args-lbl')
		);
		expect(document.body.textContent).not.toContain('요청 내용(미리보기)');
	});

	it('미리보기가 잘리면 짧은 안내를 함께 보여 준다(규칙 ID 없음)', () => {
		const { container } = render(Page, {
			data: makeData({ rows: [row(1, { args_preview: { memo: '가'.repeat(3000) } })] })
		});
		(container.querySelector('[data-action="audit-open"]') as HTMLButtonElement).click();
		flushSync();
		expect(text(document.querySelector('[data-testid="audit-args"]')).endsWith('…')).toBe(true);
		const cut = text(document.querySelector('[data-testid="audit-args-cut"]'));
		expect(cut).toBe('내용이 길어 앞부분만 보여 줘요.');
		expect(cut).not.toMatch(/R-[A-Z]+/);
	});

	it('짧은 args는 포커스 영역·넘침 단서가 없고, 넘치면 region·단서가 생긴다 (리뷰 L1)', async () => {
		const a = render(Page, { data: makeData() });
		(a.container.querySelector('[data-action="audit-open"]') as HTMLButtonElement).click();
		flushSync();
		await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
		const short = document.querySelector('[data-testid="audit-args"]') as HTMLElement;
		expect(short.getAttribute('tabindex')).toBeNull();
		expect(short.getAttribute('role')).toBeNull();
		expect(document.querySelector('[data-testid="audit-args-cue"]')).toBeNull();
		a.unmount();
		document.body.style.overflow = '';

		const b = render(Page, {
			data: makeData({ rows: [row(1, { args_preview: { memo: '가'.repeat(3000) } })] })
		});
		(b.container.querySelector('[data-action="audit-open"]') as HTMLButtonElement).click();
		flushSync();
		const args = () => document.querySelector('[data-testid="audit-args"]') as HTMLElement;
		await expect.poll(() => args()?.getAttribute('tabindex')).toBe('0');
		expect(args().getAttribute('role')).toBe('region');
		expect(args().getAttribute('aria-labelledby')).toBe('audit-args-lbl');
		expect(text(document.getElementById('audit-args-lbl'))).toBe('보낸 내용 미리보기');
		const cue = document.querySelector('[data-testid="audit-args-cue"]');
		expect(cue).not.toBeNull();
		expect(text(cue)).toBe('더 보기 · 스크롤');
		expect(
			document.querySelector('[data-testid="audit-args-wrap"]')?.classList.contains('more')
		).toBe(true);
		// 맨 아래까지 스크롤하면 단서는 꺼진다
		args().scrollTop = args().scrollHeight;
		args().dispatchEvent(new Event('scroll'));
		await expect.poll(() => document.querySelector('[data-testid="audit-args-cue"]')).toBeNull();
		b.unmount();
		document.body.style.overflow = '';
	});

	it('시트를 열면 미리보기 상자에 포커스가 가지 않고, 처음 포커스는 닫기다', async () => {
		const r = render(Page, {
			data: makeData({ rows: [row(1, { args_preview: { memo: '가'.repeat(3000) } })] })
		});
		(r.container.querySelector('[data-action="audit-open"]') as HTMLButtonElement).click();
		flushSync();
		const args = () => document.querySelector('[data-testid="audit-args"]') as HTMLElement;
		await expect.poll(() => args()?.getAttribute('tabindex')).toBe('0');
		const close = document.querySelector('.sheet-foot button') as HTMLElement;
		await expect.poll(() => document.activeElement).toBe(close);
		expect(document.activeElement).not.toBe(args());
		r.unmount();
		document.body.style.overflow = '';
	});
});
