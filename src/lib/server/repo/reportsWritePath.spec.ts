import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { forUser } from './client';
import { createReport, updateReport } from './reports.repo';
import { REPORT_PATCHABLE } from './patch';
import { isRenderFieldKey } from '$lib/server/markdown/renderFields';

/**
 * FE-04 캐시 조건 (b): 리포트 저장 경로는 렌더 결과 필드(body_blocks·toc와 이름 변형)를 DB로 넘기지 않는다.
 * (a) 컬럼 권한은 DB 몫(BE-07)이라 여기서 증명하지 않는다. 그 전까지 DB 캐시는 연결하지 않는다.
 */
function captureDb() {
	const writes: Array<{ op: string; row: Record<string, unknown> }> = [];
	const chain: Record<string, unknown> = {};
	for (const m of ['select', 'eq', 'is', 'in']) chain[m] = () => chain;
	chain.single = async () => ({ data: null, error: null });
	chain.maybeSingle = async () => ({ data: null, error: null });
	const db = {
		from: () => ({
			insert: (row: Record<string, unknown>) => (writes.push({ op: 'insert', row }), chain),
			update: (row: Record<string, unknown>) => (writes.push({ op: 'update', row }), chain),
			upsert: (row: Record<string, unknown>) => (writes.push({ op: 'upsert', row }), chain),
			select: () => chain
		})
	};
	return { db: db as never, writes };
}

const hostile = {
	body_blocks: { a: '<img src=x onerror=alert(1)>', b: '', hasSplit: false },
	bodyBlocks: { a: '<script>alert(1)</script>' },
	Body_Blocks: 1,
	'body-blocks': 1,
	toc: [{ id: 'h-x', text: 'x', level: 2, part: 'A' }],
	TOC: [],
	table_of_contents: []
};

describe('리포트 쓰기 경로는 렌더 결과 필드를 버린다(캐시 조건 b)', () => {
	it('createReport', async () => {
		const { db, writes } = captureDb();
		await createReport(forUser(db, 'owner-1'), {
			kind: 'daily_brief',
			slug: 'daily',
			title: 't',
			report_date: '2026-11-20',
			body_md: '## a',
			domain: 'macro',
			...(hostile as Record<string, unknown>)
		});
		expect(writes).toHaveLength(1);
		const keys = Object.keys(writes[0].row);
		expect(keys.filter(isRenderFieldKey)).toEqual([]);
		expect(writes[0].row.body_md).toBe('## a');
	});
	it('updateReport', async () => {
		const { db, writes } = captureDb();
		await updateReport(forUser(db, 'owner-1'), 'r-1', {
			title: 't2',
			...(hostile as Record<string, unknown>)
		});
		expect(writes).toHaveLength(1);
		expect(Object.keys(writes[0].row)).toEqual(['title']);
	});
	it('패치 허용 목록에 렌더 결과 필드가 없다', () => {
		expect(REPORT_PATCHABLE.filter(isRenderFieldKey)).toEqual([]);
	});
	it("src에서 'reports' 테이블 insert·update·upsert는 reports.repo.ts에만 있다", () => {
		const root = new URL('../../../../', import.meta.url).pathname;
		const files = (dir: string): string[] =>
			readdirSync(dir).flatMap((n) => {
				const p = join(dir, n);
				if (statSync(p).isDirectory()) return files(p);
				return /\.(ts|js|svelte)$/.test(p) && !/\.spec\.ts$/.test(p) ? [p] : [];
			});
		const re = /['"]reports['"]\s*\)\s*\.\s*(insert|update|upsert)\b/;
		const hits = files(join(root, 'src'))
			.filter((p) => re.test(readFileSync(p, 'utf8')))
			.map((p) => relative(root, p));
		expect(hits).toEqual(['src/lib/server/repo/reports.repo.ts']);
	});
});
