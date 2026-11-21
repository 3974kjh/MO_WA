import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** FE-15 수용 기준: `{@html}`은 sanitize된 renderReport() 결과를 그리는 ReportView.svelte에만 쓴다. */
const root = new URL('../../../../', import.meta.url).pathname;

function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return svelteFiles(p);
		return p.endsWith('.svelte') ? [p] : [];
	});
}

describe('{@html} 사용 위치', () => {
	it('src 전체에서 ReportView.svelte에만 있다', () => {
		const hits = svelteFiles(join(root, 'src'))
			.filter((p) => /\{@html\s/.test(readFileSync(p, 'utf8')))
			.map((p) => relative(root, p));
		expect(hits).toEqual(['src/lib/components/report/ReportView.svelte']);
	});
	it('ReportView는 report.a / report.b 만 넣는다', () => {
		const src = readFileSync(join(root, 'src/lib/components/report/ReportView.svelte'), 'utf8');
		const uses = [...src.matchAll(/\{@html\s+([^}]+)\}/g)].map((m) => m[1].trim());
		expect(uses).toEqual(['report.a', 'report.b']);
	});
});
