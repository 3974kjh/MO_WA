import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
	/** (app)/qa-nest 중첩 레이아웃 + 페이지. 레이아웃이 큰 정적 import를 가진다 */
	nestedLayoutJs?: Buffer;
	/** 이 노드 번호의 manifest 키를 지운다 */
	dropManifestNode?: number;
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
		dyn: '_app/immutable/chunks/dyn.js',
		shared: '_app/immutable/chunks/entry-a.js',
		shared2: '_app/immutable/chunks/entry-b.js'
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
	write(join(client, files.shared), noisy(3_000, 5)); // 서버 manifest의 entry imports(실제 형식)
	write(join(client, files.shared2), noisy(2_000, 6));
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
	if (opts?.nestedLayoutJs) {
		write(join(client, '_app/immutable/nodes/30.js'), blob(60, 'N'));
		write(join(client, '_app/immutable/chunks/nest.js'), opts.nestedLayoutJs);
		write(join(client, '_app/immutable/nodes/31.js'), blob(60, 'P'));
		manifest['client-optimized/nodes/30.js'] = {
			file: '_app/immutable/nodes/30.js',
			imports: ['chunks/nest.js']
		};
		manifest['chunks/nest.js'] = { file: '_app/immutable/chunks/nest.js' };
		manifest['client-optimized/nodes/31.js'] = { file: '_app/immutable/nodes/31.js' };
	}
	if (opts?.dropManifestNode !== undefined)
		delete manifest[`client-optimized/nodes/${opts.dropManifestNode}.js`];
	write(join(client, '.vite/manifest.json'), JSON.stringify(manifest, null, 2));
	write(
		join(root, '.svelte-kit/output/server/manifest.js'),
		`export const manifest = { client: {start:"${files.start}",app:"${files.app}",imports:["${files.shared}","${files.shared2}"],stylesheets:[],fonts:[],uses_env_dynamic_public:false}, };\n`
	);
	const nodeSrc: Record<string, string> = {
		'0': 'export { default as component } from "../../../../src/routes/+layout.svelte";',
		'2': 'export { default as component } from "../../../../src/routes/(app)/+layout.svelte";',
		'5': 'export { default as component } from "../../../../src/routes/(app)/+page.svelte";',
		'12': 'export { default as component } from "../../../../src/routes/(app)/portfolio/+page.svelte";',
		'20': 'export { default as component } from "../../../../src/routes/login/+page.svelte";'
	};
	if (opts?.nestedLayoutJs) {
		nodeSrc['30'] =
			'export { default as component } from "../../../../src/routes/(app)/qa-nest/+layout.svelte";';
		nodeSrc['31'] =
			'export { default as component } from "../../../../src/routes/(app)/qa-nest/+page.svelte";';
	}
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
		// 실제 형식의 server manifest(imports 여러 개·뒤따르는 필드)에서 entry 청크가 로그인·홈에 들어간다
		expect(a.login.js).toBeGreaterThan(5_000);
		expect(a.home.js).toBeGreaterThan(5_000);
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

	it('중첩 +layout.svelte의 큰 정적 import도 메뉴 증분에 들어가 실패한다 (M2)', () => {
		const ok = measure(fakeRepo({ nestedLayoutJs: Buffer.alloc(100, 'n') }));
		expect(ok.routes.map((r) => r.route)).toContain('qa-nest');
		expect(passed(evaluate(ok))).toBe(true);

		const repo = fakeRepo({ nestedLayoutJs: noisy(150_000) });
		const report = measure(repo);
		const nest = report.routes.find((r) => r.route === 'qa-nest')!;
		expect(nest.inc).toBeGreaterThan(LIMITS.menuIncrement);
		const ev = evaluate(report);
		expect(ev.hard.find((r) => r.id === 'menuIncrement')?.ok).toBe(false);
		expect(passed(ev)).toBe(false);
		// 다른 라우트(포트폴리오)의 증분은 중첩 레이아웃의 영향을 받지 않는다
		const base = measure(fakeRepo());
		expect(report.routes.find((r) => r.route === 'portfolio')!.inc).toBe(
			base.routes.find((r) => r.route === 'portfolio')!.inc
		);
	});

	it('manifest에 키가 없는 페이지·레이아웃 노드는 건너뛰지 않고 실패한다 (L1)', () => {
		expect(() => measure(fakeRepo({ dropManifestNode: 12 }))).toThrow(/missing page node 12/);
		expect(() =>
			measure(fakeRepo({ nestedLayoutJs: Buffer.alloc(10, 'n'), dropManifestNode: 30 }))
		).toThrow(/missing layout node 30/);
		expect(() => measure(fakeRepo({ dropManifestNode: 20 }))).toThrow(/missing/);
	});
});

describe('check-client-size CLI (L2)', () => {
	const script = fileURLToPath(new URL('./check-client-size.mjs', import.meta.url));
	const run = (entry: string, repo: string, extra: string[] = []) =>
		spawnSync(process.execPath, [entry, repo, ...extra], { encoding: 'utf8' });

	it('심볼릭 링크 경로로 실행해도 측정·출력하고 종료 코드를 낸다', () => {
		const dir = mkdtempSync(join(tmpdir(), 'client-size-link-'));
		const link = join(dir, 'scripts-link');
		symlinkSync(fileURLToPath(new URL('.', import.meta.url)), link);
		const viaLink = join(link, 'check-client-size.mjs');

		const okRun = run(viaLink, fakeRepo());
		expect(okRun.status).toBe(0);
		expect(okRun.stdout).toContain('크기 가드');
		expect(okRun.stdout).toContain('PASS');

		const failRun = run(viaLink, fakeRepo({ homeCss: noisy(130_000) }));
		expect(failRun.status).toBe(1);
		expect(failRun.stdout).toContain('FAIL');

		const noBuild = run(viaLink, mkdtempSync(join(tmpdir(), 'client-size-empty-')));
		expect(noBuild.status).toBe(2);
		expect(noBuild.stderr).toContain('build output missing');
	});

	it('실제 경로로 실행한 결과와 링크로 실행한 결과가 같다', () => {
		const repo = fakeRepo();
		const dir = mkdtempSync(join(tmpdir(), 'client-size-link-'));
		const link = join(dir, 'scripts-link');
		symlinkSync(fileURLToPath(new URL('.', import.meta.url)), link);
		const a = run(script, repo);
		const b = run(join(link, 'check-client-size.mjs'), repo);
		expect(b.stdout).toBe(a.stdout);
		expect(b.status).toBe(a.status);
	});
});
