#!/usr/bin/env node
/**
 * 클라이언트 크기 가드. 사용자가 한 번에 받는 양(첫 화면·메뉴별 동기 import 클로저)을
 * 빌드 manifest로 잰다. dynamicImports는 초기 로드에 넣지 않는다.
 *
 * 하드 한도(gzip, level 9, mtime 0): /login 초기 80,000 · 홈(/) 초기 120,000 ·
 * 첫 화면 CSS(홈·로그인) 32,000 · 메뉴 증분(셸 대비) 60,000 · 메뉴 전체 140,000.
 * 전체 JS+CSS 합 250,000 · 전체 CSS 합 45,056 은 참고치만 출력하고 차단하지 않는다.
 *
 * 동기 import 경로만 잰다: 실제 첫 로드 전송량에는 유휴 시간에 미리 받는 dynamic import
 * (토스트·더보기·정확한 금액 시트 등)와 차트 청크가 더해진다. 라우트마다 루트 레이아웃부터 그 라우트의
 * 모든 조상 +layout.svelte(중첩 포함)를 동기 클로저에 넣고, manifest에 없는 노드는 실패로 본다.
 *
 * Usage: node scripts/check-client-size.mjs [repoRoot]
 * Default repoRoot: cwd. Needs a completed client build under .svelte-kit/output.
 * Fail-closed if manifests are missing.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LIMITS = {
	loginInitial: 80_000,
	homeInitial: 120_000,
	firstScreenCss: 32_000,
	menuIncrement: 60_000,
	menuFull: 140_000
};

/** 예전 하드 한도. 출력만 하고 실패 이유로 쓰지 않는다. */
export const REFERENCE = {
	allTotal: 250_000,
	allCss: 45_056
};

/** Deterministic gzip size (bytes). */
export function gzipSize(buf) {
	return gzipSync(buf, { level: 9, mtime: 0 }).length;
}

/**
 * @param {string} repoRoot
 * @returns {{
 *   login: { js: number, css: number, sum: number },
 *   home: { js: number, css: number, sum: number },
 *   shell: { js: number, css: number, sum: number },
 *   routes: Array<{ route: string, inc: number, incJs: number, incCss: number, full: number, fullJs: number, fullCss: number }>,
 *   all: { js: number, css: number, sum: number, jsFiles: number, cssFiles: number }
 * }}
 */
export function measure(repoRoot) {
	const client = join(repoRoot, '.svelte-kit/output/client');
	const manifestPath = join(client, '.vite/manifest.json');
	const serverManifest = join(repoRoot, '.svelte-kit/output/server/manifest.js');
	const nodesDir = join(repoRoot, '.svelte-kit/generated/client-optimized/nodes');
	if (!existsSync(manifestPath) || !existsSync(serverManifest) || !existsSync(nodesDir)) {
		const err = new Error(
			'client-size: build output missing (.svelte-kit/output/client/.vite/manifest.json, server/manifest.js, generated/client-optimized/nodes)'
		);
		err.code = 'NO_BUILD';
		throw err;
	}

	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const manjs = readFileSync(serverManifest, 'utf8');
	const cm = manjs.match(/client: \{start:"([^"]+)",app:"([^"]+)",imports:\[([^\]]*)\]/);
	if (!cm) throw new Error('client-size: could not parse server manifest client start/app/imports');
	const start = cm[1];
	const app = cm[2];
	const entryImports = [...cm[3].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
	const entry = [start, app, ...entryImports];

	/** @type {Map<number, string>} */
	const nodeOf = new Map();
	for (const name of readdirSync(nodesDir).sort((a, b) => a.localeCompare(b))) {
		if (!name.endsWith('.js')) continue;
		const t = readFileSync(join(nodesDir, name), 'utf8');
		const m = t.match(/src\/routes\/(.*?)"/);
		nodeOf.set(Number(name.replace(/\.js$/, '')), m ? m[1] : '');
	}

	const nid = (exact) => {
		const hits = [...nodeOf.entries()].filter(([, r]) => r === exact).map(([i]) => i);
		if (hits.length !== 1) {
			throw new Error(`client-size: nid(${JSON.stringify(exact)}) hits=${JSON.stringify(hits)}`);
		}
		return hits[0];
	};

	const idOf = new Map([...nodeOf.entries()].map(([i, r]) => [r, i]));
	const root = nid('+layout.svelte');
	const appn = nid('(app)/+layout.svelte');
	const login = nid('login/+page.svelte');
	const home = nid('(app)/+page.svelte');

	/** @type {Map<number, string>} */
	const nk = new Map();
	for (const k of Object.keys(manifest).sort((a, b) => a.localeCompare(b))) {
		const m = k.match(/client-optimized\/nodes\/(\d+)\.js$/);
		if (m) nk.set(Number(m[1]), k);
	}
	for (const id of [root, appn, login, home]) {
		if (!nk.has(id)) throw new Error(`client-size: manifest missing node ${id}`);
	}

	/** 라우트(+page) 노드 경로의 모든 조상 레이아웃 노드 경로(루트부터). 중첩·그룹 레이아웃 포함. */
	const layoutChain = (pagePath) => {
		const dirs = pagePath.split('/').slice(0, -1);
		const out = [];
		for (let n = 0; n <= dirs.length; n++) {
			const prefix = dirs.slice(0, n).join('/');
			const base = prefix ? `${prefix}/` : '';
			for (const [r] of idOf) {
				// +layout.svelte, +layout@.svelte, +layout@(app).svelte 모두 조상으로 센다(보수적)
				if (
					r.startsWith(`${base}+layout`) &&
					/^\+layout(@[^/]*)?\.svelte$/.test(r.slice(base.length))
				)
					out.push(r);
			}
		}
		return out;
	};

	const sz = (rel) => {
		const buf = readFileSync(join(client, rel));
		return { raw: buf.length, gzip: gzipSize(buf) };
	};

	const closure = (seedFiles, seedKeys) => {
		const js = new Set();
		const css = new Set();
		const seen = new Set();
		const q = [...seedKeys];
		for (const f of seedFiles) (f.endsWith('.css') ? css : js).add(f);
		while (q.length) {
			const k = q.pop();
			if (seen.has(k) || !manifest[k]) continue;
			seen.add(k);
			const v = manifest[k];
			if (v.file) (v.file.endsWith('.css') ? css : js).add(v.file);
			for (const c of v.css ?? []) css.add(c);
			// sync only — v.dynamicImports intentionally ignored
			for (const im of v.imports ?? []) q.push(im);
		}
		return { js, css };
	};

	const tot = (files) => {
		let raw = 0;
		let gzip = 0;
		for (const f of files) {
			const s = sz(f);
			raw += s.raw;
			gzip += s.gzip;
		}
		return { raw, gzip, files: files.size ?? files.length };
	};

	const pack = (sets) => {
		const j = tot(sets.js);
		const c = tot(sets.css);
		return { js: j.gzip, css: c.gzip, sum: j.gzip + c.gzip, jsRaw: j.raw, cssRaw: c.raw };
	};

	/** 라우트 페이지 노드 경로 → 조상 레이아웃 전부 + 페이지의 동기 클로저(fail closed) */
	const fullFor = (r) => {
		const id = idOf.get(r);
		if (!nk.has(id)) throw new Error(`client-size: manifest missing page node ${id} (${r})`);
		const chain = layoutChain(r);
		for (const l of chain) {
			if (!nk.has(idOf.get(l)))
				throw new Error(`client-size: manifest missing layout node ${idOf.get(l)} (${l})`);
		}
		const keys = [...chain.map((l) => nk.get(idOf.get(l))), nk.get(id)];
		return { chain, full: pack(closure(entry, keys)) };
	};
	const shellM = pack(closure(entry, [nk.get(root), nk.get(appn)]));
	const loginM = fullFor('login/+page.svelte').full;
	const homeM = fullFor('(app)/+page.svelte').full;

	const routes = [];
	for (const r of [...nodeOf.values()].sort((a, b) => a.localeCompare(b))) {
		if (!r.endsWith('+page.svelte')) continue;
		if (r.startsWith('dev/') || r.startsWith('demo/')) continue;
		// 빌드에 나온 페이지 노드가 manifest에 없으면 조용히 건너뛰지 않고 실패(fail closed, fullFor)
		const isLogin = r === 'login/+page.svelte';
		const { chain, full: fullM } = fullFor(r);
		// 증분의 기준 = 알려진 셸(루트, (app)). 중첩 레이아웃·페이지가 더한 양은 모두 메뉴 증분에 든다
		const shellLayouts = chain.filter(
			(l) => l === '+layout.svelte' || l === '(app)/+layout.svelte'
		);
		const baseM = pack(
			closure(
				entry,
				shellLayouts.map((l) => nk.get(idOf.get(l)))
			)
		);
		const rel = isLogin
			? '/login'
			: r === '(app)/+page.svelte'
				? '/'
				: r.replace(/^\(app\)\//, '').replace(/\/\+page\.svelte$/, '');
		routes.push({
			route: rel,
			incJs: fullM.js - baseM.js,
			incCss: fullM.css - baseM.css,
			inc: fullM.sum - baseM.sum,
			fullJs: fullM.js,
			fullCss: fullM.css,
			full: fullM.sum
		});
	}

	if (routes.length === 0) throw new Error('client-size: no page routes found in build output');

	let aj = 0;
	let ac = 0;
	let nj = 0;
	let nc = 0;
	const walk = (dir) => {
		if (!existsSync(dir)) return;
		for (const name of readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
			const p = join(dir, name);
			const st = statSync(p);
			if (st.isDirectory()) {
				walk(p);
				continue;
			}
			if (name.endsWith('.js')) {
				aj += gzipSize(readFileSync(p));
				nj += 1;
			} else if (name.endsWith('.css')) {
				ac += gzipSize(readFileSync(p));
				nc += 1;
			}
		}
	};
	walk(join(client, '_app/immutable'));

	return {
		login: loginM,
		home: homeM,
		shell: shellM,
		routes,
		all: { js: aj, css: ac, sum: aj + ac, jsFiles: nj, cssFiles: nc }
	};
}

/**
 * @param {ReturnType<typeof measure>} report
 * @returns {{ hard: Array<{ id: string, label: string, value: number, limit: number, ok: boolean }>, reference: Array<{ id: string, label: string, value: number, limit: number }> }}
 */
export function evaluate(report) {
	const maxInc = Math.max(0, ...report.routes.map((r) => r.inc));
	const maxFull = Math.max(0, ...report.routes.map((r) => r.full));
	const maxIncRoute = report.routes.reduce((a, b) => (b.inc > (a?.inc ?? -1) ? b : a), null);
	const maxFullRoute = report.routes.reduce((a, b) => (b.full > (a?.full ?? -1) ? b : a), null);
	const hard = [
		{
			id: 'loginInitial',
			label: '/login 초기 JS+CSS',
			value: report.login.sum,
			limit: LIMITS.loginInitial
		},
		{
			id: 'homeInitial',
			label: '/ 홈 초기 JS+CSS',
			value: report.home.sum,
			limit: LIMITS.homeInitial
		},
		{
			id: 'homeCss',
			label: '첫 화면 CSS (홈)',
			value: report.home.css,
			limit: LIMITS.firstScreenCss
		},
		{
			id: 'loginCss',
			label: '첫 화면 CSS (로그인)',
			value: report.login.css,
			limit: LIMITS.firstScreenCss
		},
		{
			id: 'menuIncrement',
			label: `메뉴 증분 최대 (${maxIncRoute?.route ?? '—'})`,
			value: maxInc,
			limit: LIMITS.menuIncrement
		},
		{
			id: 'menuFull',
			label: `메뉴 전체 최대 (${maxFullRoute?.route ?? '—'})`,
			value: maxFull,
			limit: LIMITS.menuFull
		}
	].map((row) => ({ ...row, ok: row.value <= row.limit }));

	const reference = [
		{
			id: 'allTotal',
			label: '전체 JS+CSS 합 (참고)',
			value: report.all.sum,
			limit: REFERENCE.allTotal
		},
		{
			id: 'allCss',
			label: '전체 CSS 합 (참고)',
			value: report.all.css,
			limit: REFERENCE.allCss
		}
	];
	return { hard, reference };
}

export function formatReport(report, ev = evaluate(report)) {
	const line = (row, kind) => {
		const mark =
			kind === 'hard' ? (row.ok ? 'PASS' : 'FAIL') : row.value <= row.limit ? 'under' : 'over';
		const margin = row.limit - row.value;
		const marginTxt = margin >= 0 ? `여유 ${margin}` : `초과 ${-margin}`;
		return `  ${row.label.padEnd(28)} ${String(row.value).padStart(7)}  <= ${String(row.limit).padStart(7)}  ${mark}  (${marginTxt})`;
	};
	const rows = [
		'크기 가드 gzip (동기 클로저, dynamic import 제외)',
		'※ 동기 경로만 측정: 유휴 미리 받기·차트 등 dynamic import 바이트는 첫 로드 전송량에 더해지지만 여기엔 없다',
		'[하드]',
		...ev.hard.map((r) => line(r, 'hard')),
		'[참고 — 차단 안 함]',
		...ev.reference.map((r) => line(r, 'ref')),
		'[메뉴별]',
		`${'route'.padEnd(22)} ${'inc'.padStart(7)} ${'full'.padStart(7)}`,
		...report.routes.map(
			(r) => `${r.route.padEnd(22)} ${String(r.inc).padStart(7)} ${String(r.full).padStart(7)}`
		)
	];
	return rows.join('\n');
}

export function passed(ev) {
	return ev.hard.every((r) => r.ok);
}

/**
 * CLI 진입 여부.
 * - run: 이 파일이 메인(심볼릭 링크·--preserve-symlinks-main·상대 경로 포함)
 * - skip: 다른 파일이 메인(테스트 등이 import)
 * - unknown: 이 스크립트로 실행된 것으로 보이지만 경로를 확정할 수 없음 → 조용히 통과하지 않는다
 */
export function cliInvocation(argv1 = process.argv[1], metaUrl = import.meta.url) {
	if (!argv1) return 'skip';
	const urlsOf = (p) => {
		const out = [];
		try {
			out.push(pathToFileURL(p).href);
		} catch {
			/* ignore */
		}
		try {
			out.push(pathToFileURL(realpathSync(p)).href);
		} catch {
			/* ignore */
		}
		return out;
	};
	const argUrls = urlsOf(argv1);
	const metaUrls = [metaUrl];
	try {
		metaUrls.push(pathToFileURL(realpathSync(fileURLToPath(metaUrl))).href);
	} catch {
		/* ignore */
	}
	if (argUrls.some((u) => metaUrls.includes(u))) return 'run';
	try {
		if (basename(argv1) === basename(fileURLToPath(metaUrl))) return 'unknown';
	} catch {
		/* ignore */
	}
	return 'skip';
}

/** @deprecated 테스트·호환용. 인식 실패는 false가 아니라 cliInvocation()의 'unknown'으로 본다. */
export function isMainModule(argv1 = process.argv[1], metaUrl = import.meta.url) {
	return cliInvocation(argv1, metaUrl) === 'run';
}

const invocation = cliInvocation();
if (invocation === 'unknown') {
	console.error(
		'client-size: could not determine whether this process is the CLI entry (refusing to no-op)'
	);
	process.exit(1);
}

if (invocation === 'run') {
	const root = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? process.cwd();
	try {
		const report = measure(root);
		const ev = evaluate(report);
		if (process.argv.includes('--json')) {
			console.log(JSON.stringify({ report, ev }, null, 2));
		} else {
			console.log(formatReport(report, ev));
		}
		process.exit(passed(ev) ? 0 : 1);
	} catch (e) {
		console.error(e.message ?? e);
		process.exit(e.code === 'NO_BUILD' ? 2 : 1);
	}
}
