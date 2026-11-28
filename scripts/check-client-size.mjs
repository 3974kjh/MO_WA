#!/usr/bin/env node
/**
 * 클라이언트 크기 가드. 사용자가 한 번에 받는 양(첫 화면·메뉴별 동기 import 클로저)을
 * 빌드 manifest로 잰다. dynamicImports는 초기 로드에 넣지 않는다.
 *
 * 하드 한도(gzip, level 9, mtime 0): /login 초기 80,000 · 홈(/) 초기 120,000 ·
 * 첫 화면 CSS(홈·로그인) 32,000 · 메뉴 증분(셸 대비) 60,000 · 메뉴 전체 140,000.
 * 전체 JS+CSS 합 250,000 · 전체 CSS 합 45,056 은 참고치만 출력하고 차단하지 않는다.
 *
 * Usage: node scripts/check-client-size.mjs [repoRoot]
 * Default repoRoot: cwd. Needs a completed client build under .svelte-kit/output.
 * Fail-closed if manifests are missing.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

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

	const loginM = pack(closure(entry, [nk.get(root), nk.get(login)]));
	const shellM = pack(closure(entry, [nk.get(root), nk.get(appn)]));
	const homeM = pack(closure(entry, [nk.get(root), nk.get(appn), nk.get(home)]));
	const rootM = pack(closure(entry, [nk.get(root)]));

	const routes = [];
	for (const [i, r] of [...nodeOf.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
		if (!r.endsWith('+page.svelte')) continue;
		if (r.startsWith('dev/') || r.startsWith('demo/')) continue;
		if (!nk.has(i)) continue;
		const isLogin = r === 'login/+page.svelte';
		const baseKeys = isLogin ? [nk.get(root)] : [nk.get(root), nk.get(appn)];
		const fullM = pack(closure(entry, [...baseKeys, nk.get(i)]));
		const baseM = isLogin ? rootM : shellM;
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

const isCli = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
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
