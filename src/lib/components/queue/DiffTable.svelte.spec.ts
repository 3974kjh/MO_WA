/** F2 후속 Nit-2: 행마다 항목 이름 길이가 달라도 세 열의 시작·끝이 모든 행에서 같아야 한다. */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DiffTable from './DiffTable.svelte';
import type { DiffRow } from '$lib/queue/proposals';

const rows: DiffRow[] = [
	{ key: 'qty', label: '수량', from: '10', to: '12' },
	{ key: 'avg_price', label: '평균 단가', from: '71,000', to: '70,250.5' },
	{ key: 'status', label: '상태', from: '대기', to: '반영' }
];

function columnEdges(container: HTMLElement) {
	return [...container.querySelectorAll('[role="row"]')].map((row) =>
		[...row.children].map((c) => {
			const r = (c as HTMLElement).getBoundingClientRect();
			return [Math.round(r.left), Math.round(r.right)];
		})
	);
}

describe('DiffTable 열 정렬', () => {
	for (const width of [390, 768, 1280]) {
		it(`너비 ${width}px: 머리글과 모든 행의 열 경계가 같다`, async () => {
			const host = document.createElement('div');
			host.style.width = `${Math.min(width, window.innerWidth) - 32}px`;
			document.body.appendChild(host);
			try {
				const { container } = render(DiffTable, { target: host, props: { rows } });
				await expect.poll(() => container.querySelectorAll('[role="row"]').length).toBe(4);
				const edges = columnEdges(container as HTMLElement);
				for (const row of edges) {
					expect(row).toHaveLength(3);
					expect(row).toEqual(edges[0]);
				}
				// 첫 열은 가장 긴 항목 이름에 맞춘다(64px 이상).
				const [l, r] = edges[0]![0]!;
				expect(r - l).toBeGreaterThanOrEqual(64);
			} finally {
				host.remove();
			}
		});
	}
});
