import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { LIMITS, REFERENCE, evaluate, gzipSize, measure, passed } from './check-client-size.mjs';

function write(p: string, s: string | Buffer) {
	mkdirSync(join(p, '..'), { recursive: true });
	writeFileSync(p, s);
}

/** Incompressible payload so gzip size stays close to raw length. */
function noisy(n: number, seed = 17) {
	const b = Buffer.alloc(n);
	let x = seed;
	for (let i = 0; i < n; i++) {
		x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
		// 상위 비트를 써서 8비트 주기가 반복되지 않게 한다.
		b[i] = ((x >>> 16) ^ (x >>> 8) ^ i) & 255;
	}
	return b;
}

/** Tiny built tree: entry + root + app layout + login + home + heavy menu. */
function fakeRepo(opts?: {
	homeCss?: string | Buffer;
	menuJs?: string | Buffer;
	extraAllCss?: string | Buffer;
	dynamicHeavy?: boolean;
}) {
	const root = mkdtempSync(join(tmpdir(), 'client-size-'));
	const client = join(root, '.svelte-kit/output/client');
	const nodes = join(root, '.svelte-kit/generated/client-optimized/nodes');
	const files = {
		start: '_app/immutable/entry/start.js',
		app: '_app/immutable/entry/app.js',
		n0: '_app/immutable/nodes/0.js',
		n0css: '_app/immutable/assets/0.css',
		n2: '_app/immutable/nodes/2.js',
		n5: '_app/immutable/nodes/5.js',
		n5css: '_app/immutable/assets/5.css',
		n12: '_app/immutable/nodes/12.js',
		n12css: '_app/immutable/assets/12.css',
		n20: '_app/immutable/nodes/20.js',
		n20css: '_app/immutable/assets/20.css',
		heavy: '_app/immutable/chunks/heavy.js',
		dyn: '_app/immutable/chunks/dyn.js'
	};
	const blob = (n: number, ch = 'a') => Buffer.alloc(n, ch);
	write(join(client, files.start), blob(40, 's'));
	write(join(client, files.app), blob(40, 'A'));
	write(join(client, files.n0), blob(80, '0'));
	write(join(client, files.n0css), blob(120, 'c'));
	write(join(client, files.n2), blob(80, '2'));
	write(join(client, files.n5), blob(100, '5'));
	write(join(client, files.n5css), opts?.homeCss ?? blob(80, 'h'));
	write(join(client, files.n12), opts?.menuJs ?? blob(100, 'p'));
	write(join(client, files.n12css), blob(40, 'q'));
	write(join(client, files.n20), blob(60, 'L'));
	write(join(client, files.n20css), blob(50, 'l'));
	write(join(client, files.heavy), blob(200, 'H'));
	write(join(client, files.dyn), blob(500_000, 'D')); // huge — must not enter sync closures
	if (opts?.extraAllCss) write(join(client, '_app/immutable/assets/orphan.css'), opts.extraAllCss);

	const manifest: Record<
		string,
		{ file: string; css?: string[]; imports?: string[]; dynamicImports?: string[] }
	> = {
		'client-optimized/nodes/0.js': { file: files.n0, css: [files.n0css] },
		'client-optimized/nodes/2.js': { file: files.n2 },
		'client-optimized/nodes/5.js': {
			file: files.n5,
			css: [files.n5css],
			dynamicImports:
				opts?.dynamicHeavy === false ? [] : ['.svelte-kit/generated/client-optimized/unused.js']
		},
		'client-optimized/nodes/12.js': {
			file: files.n12,
			css: [files.n12css],
			imports: ['chunks/heavy.js']
		},
		'client-optimized/nodes/20.js': { file: files.n20, css: [files.n20css] },
		'chunks/heavy.js': { file: files.heavy },
		'chunks/dyn.js': { file: files.dyn }
	};
	// Vite keys the node files like this; also map dynamic to dyn chunk via a fake module
	if (opts?.dynamicHeavy !== false) {
		manifest['src/lib/heavy-dyn.js'] = { file: files.dyn };
		manifest['client-optimized/nodes/5.js'].dynamicImports = ['src/lib/heavy-dyn.js'];
	}
	write(join(client, '.vite/manifest.json'), JSON.stringify(manifest, null, 2));
	write(
		join(root, '.svelte-kit/output/server/manifest.js'),
		`export const manifest = { client: {start:"${files.start}",app:"${files.app}",imports:[]}, };\n`
	);
	const nodeSrc: Record<string, string> = {
		'0': 'export { default as component } from "../../../../src/routes/+layout.svelte";',
		'2': 'export { default as component } from "../../../../src/routes/(app)/+layout.svelte";',
		'5': 'export { default as component } from "../../../../src/routes/(app)/+page.svelte";',
		'12': 'export { default as component } from "../../../../src/routes/(app)/portfolio/+page.svelte";',
		'20': 'export { default as component } from "../../../../src/routes/login/+page.svelte";'
	};
	for (const [id, src] of Object.entries(nodeSrc)) write(join(nodes, `${id}.js`), src);
	return root;
}

describe('check-client-size', () => {
	it('gzipSize is deterministic (mtime 0)', () => {
		const b = Buffer.from('hello-client-size');
		expect(gzipSize(b)).toBe(gzipSize(b));
		expect(gzipSize(b)).toBe(37);
	});

	it('sync closures exclude dynamicImports and pass under default fixture', () => {
		const repo = fakeRepo();
		const a = measure(repo);
		const b = measure(repo);
		expect(a).toEqual(b);
		expect(a.home.sum).toBeLessThan(LIMITS.homeInitial);
		expect(a.login.sum).toBeLessThan(LIMITS.loginInitial);
		// huge dyn chunk is only in the all-files inventory
		expect(a.all.js).toBeGreaterThan(a.home.js);
		expect(a.home.sum).toBeLessThan(10_000);
		const ev = evaluate(a);
		expect(passed(ev)).toBe(true);
		expect(ev.hard.every((r) => r.ok)).toBe(true);
	});

	it('fails when home initial exceeds the hard budget', () => {
		const repo = fakeRepo({ homeCss: noisy(130_000) });
		const ev = evaluate(measure(repo));
		expect(ev.hard.find((r) => r.id === 'homeInitial')?.ok).toBe(false);
		expect(ev.hard.find((r) => r.id === 'homeCss')?.ok).toBe(false);
		expect(passed(ev)).toBe(false);
	});

	it('fails when a menu increment or full page exceeds the hard budget', () => {
		const repo = fakeRepo({ menuJs: noisy(150_000) });
		const ev = evaluate(measure(repo));
		expect(ev.hard.find((r) => r.id === 'menuIncrement')?.ok).toBe(false);
		expect(ev.hard.find((r) => r.id === 'menuFull')?.ok).toBe(false);
		expect(passed(ev)).toBe(false);
	});

	it('does not fail when only the old all-files totals exceed the reference caps', () => {
		const repo = fakeRepo({
			extraAllCss: noisy(50_000)
		});
		const report = measure(repo);
		const ev = evaluate(report);
		expect(report.all.css).toBeGreaterThan(REFERENCE.allCss);
		expect(ev.reference.find((r) => r.id === 'allCss')?.value).toBe(report.all.css);
		expect(passed(ev)).toBe(true);
	});

	it('documents the approved hard limits', () => {
		expect(LIMITS).toEqual({
			loginInitial: 80_000,
			homeInitial: 120_000,
			firstScreenCss: 32_000,
			menuIncrement: 60_000,
			menuFull: 140_000
		});
		const doc = readFileSync(new URL('../docs/stocks-screens.md', import.meta.url), 'utf8');
		expect(doc).toMatch(/80,000/);
		expect(doc).toMatch(/120,000/);
		expect(doc).toMatch(/32,000/);
		expect(doc).toMatch(/60,000/);
		expect(doc).toMatch(/140,000/);
		expect(doc).toMatch(/참고/);
		expect(doc).toMatch(/250,000/);
		expect(doc).toMatch(/45,056/);
	});
});
