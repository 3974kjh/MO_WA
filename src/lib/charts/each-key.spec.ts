import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { groupDonut, plainNumber, signedNumber } from './layout';
import DonutChart from '$lib/components/charts/DonutChart.svelte';

const DIR = join(process.cwd(), 'src/lib/components/charts');

describe('FE-14 Low-1: each 키는 라벨·이름이 아니라 인덱스', () => {
	it('차트 컴포넌트에서 라벨/이름을 {#each} 키로 쓰지 않는다 (중복 라벨 → Svelte 키 중복 오류 방지)', () => {
		const re = /\{#each[^}]*\(\s*[\w.]*\.(label|name)\s*\)\s*\}/;
		const offenders = readdirSync(DIR)
			.filter((f) => f.endsWith('.svelte'))
			.filter((f) => re.test(readFileSync(join(DIR, f), 'utf8')));
		expect(offenders).toEqual([]);
	});

	it("라벨이 중복되고 원래 이름이 '기타'인 항목이 묶인 '기타'와 함께여도 도넛이 그려진다", () => {
		const items = [
			{ label: 'A', value: 30 },
			{ label: 'A', value: 30 },
			{ label: '기타', value: 30 },
			{ label: 'x', value: 5 },
			{ label: 'y', value: 5 }
		];
		const slices = groupDonut(items);
		const labels = slices.map((s) => s.label);
		expect(new Set(labels).size).toBeLessThan(labels.length);
		const { body } = render(DonutChart, { props: { items, ariaLabel: '비중' } });
		expect(body).toContain('기타');
	});
});

describe('FE-14 Low-1/2: 기타 구분·NaN 표시', () => {
	it("원래 이름이 '기타'인 개별 항목은 묶음 '기타'와 라벨이 겹치지 않는다", () => {
		const slices = groupDonut([
			{ label: '기타', value: 50 },
			{ label: 'A', value: 44 },
			{ label: 'x', value: 3 },
			{ label: 'y', value: 3 }
		]);
		const labels = slices.map((s) => s.label);
		expect(new Set(labels).size).toBe(labels.length);
		expect(labels.filter((l) => l === '기타')).toHaveLength(1);
		expect(slices.at(-1)?.members).toEqual(['x', 'y']);
	});

	it("NaN은 '−NaN'이 아니라 '—'로 표시한다", () => {
		expect(signedNumber(NaN, 1)).toBe('—');
		expect(plainNumber(NaN, 1)).toBe('—');
		expect(signedNumber(Infinity, 1)).toBe('—');
	});
});
