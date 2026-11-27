/**
 * DataTable nowrap (768 포트폴리오 표 줄바꿈 후속): ≥640 에서 열이 많은 표가 칸마다 글자 단위로 꺾이지 않고
 * 가로 스크롤 + 첫 열 고정으로 보이는지. 브라우저 실제 레이아웃으로 잰다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import DataTable from './DataTable.svelte';

const columns = [
	{ key: 'name', label: '종목' },
	{ key: 'qty', label: '수량', align: 'right' as const },
	{ key: 'avg', label: '평균 단가', align: 'right' as const },
	{ key: 'stop', label: '손익분기 가격', align: 'right' as const },
	{ key: 'now', label: '현재가', align: 'right' as const },
	{ key: 'pnl', label: '수익률', align: 'right' as const },
	{ key: 'val', label: '평가금액', align: 'right' as const },
	{ key: 'w', label: '비중', align: 'right' as const },
	{ key: 'watch', label: '감시 가격까지', align: 'right' as const },
	{ key: 'act', label: '작업', align: 'right' as const }
];
const rows = [
	{
		name: '테스트종목',
		qty: '3주',
		avg: '1,000원',
		stop: '—',
		now: '1,100원',
		pnl: '+10.0%',
		val: '3,300원',
		w: '100.0%',
		watch: '—',
		act: '기록 수정'
	}
];

// 768 레일 레이아웃의 표 영역(감싸는 폭 654)을 흉내: 고정 폭 부모 안에 렌더
const WRAP_W = 654;

afterEach(async () => {
	await page.viewport(414, 896);
});

function mount(props: { nowrap?: boolean; stickyFirst?: boolean }, width = WRAP_W) {
	const r = render(DataTable, { columns, rows, mobile: 'cards', caption: '표', ...props });
	const host = r.container as HTMLElement;
	host.style.width = `${width}px`;
	return { host, ...r };
}
const firstRowCells = (host: HTMLElement) => [
	...host.querySelectorAll<HTMLElement>('tbody tr:first-child td')
];

describe('DataTable nowrap', () => {
	it('≥640: nowrap 이면 칸 높이가 한 줄이고, 폭이 모자라면 감싸는 영역이 가로 스크롤된다', async () => {
		await page.viewport(768, 900);
		const { host } = mount({ nowrap: true, stickyFirst: true });
		const wrap = host.querySelector<HTMLElement>('.tbl-wrap')!;
		const heights = firstRowCells(host).map((c) => c.getBoundingClientRect().height);
		expect(Math.max(...heights)).toBeLessThan(48); // 한 줄(11+11 패딩 + 20 줄높이 ≈ 43)
		expect(wrap.scrollWidth).toBeGreaterThan(wrap.clientWidth);
		expect(getComputedStyle(wrap).overflowX).toBe('auto');
	});

	it('≥640: 기본값(nowrap 아님)은 예전 동작 그대로 — 좁으면 칸이 꺾인다(다른 표 영향 없음)', async () => {
		await page.viewport(768, 900);
		const { host } = mount({});
		const heights = firstRowCells(host).map((c) => c.getBoundingClientRect().height);
		expect(Math.max(...heights)).toBeGreaterThan(60);
	});

	it('≥640: stickyFirst 이면 첫 열이 sticky, 오른쪽으로 스크롤해도 왼쪽에 붙어 있다', async () => {
		await page.viewport(768, 900);
		const { host } = mount({ nowrap: true, stickyFirst: true });
		const wrap = host.querySelector<HTMLElement>('.tbl-wrap')!;
		const first = host.querySelector<HTMLElement>('tbody tr:first-child td:first-child')!;
		expect(getComputedStyle(first).position).toBe('sticky');
		const before = first.getBoundingClientRect().left;
		wrap.scrollLeft = 120;
		expect(wrap.scrollLeft).toBeGreaterThan(0);
		await new Promise((r) => requestAnimationFrame(() => r(null)));
		expect(first.getBoundingClientRect().left).toBe(before); // 스크롤해도 제자리
	});

	it('우측 스크롤 힌트(.hint)가 nowrap 표에서도 켜진다', async () => {
		await page.viewport(768, 900);
		const { host } = mount({ nowrap: true, stickyFirst: true });
		await expect
			.poll(() => host.querySelector('.tbl-outer')!.classList.contains('hint'))
			.toBe(true);
	});

	it('<640 카드형: stickyFirst·nowrap 을 줘도 카드 제목 칸은 고정·줄바꿈 금지되지 않는다', async () => {
		await page.viewport(390, 844);
		const { host } = mount({ nowrap: true, stickyFirst: true }, 358);
		const first = host.querySelector<HTMLElement>('tbody tr:first-child td:first-child')!;
		expect(getComputedStyle(first).position).not.toBe('sticky');
		expect(getComputedStyle(first).whiteSpace).not.toBe('nowrap');
		const plain = mount({}, 358).host.querySelector<HTMLElement>('.tbl-wrap')!;
		const w = host.querySelector<HTMLElement>('.tbl-wrap')!;
		expect(w.scrollWidth).toBe(plain.scrollWidth); // 카드형 폭은 두 옵션과 무관
	});
});
