#!/usr/bin/env node
/**
 * Guard: a production SvelteKit output must not contain /dev routes
 * or links to /dev (not mo-wa.pages.dev, not /devices).
 * Usage: node scripts/check-prod-no-dev.mjs [outputRoot]
 * Default outputRoot: .svelte-kit/output
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Pathname /dev or /dev/... — not pages.dev, not /devices, not /developer. */
export const DEV_PATH_RE = /(?:^|[^A-Za-z0-9.-])\/dev(?=\/|[/?#"'`]|$)/g;

export const LINK_RE =
	/\b(?:href|to|goto|resolve|redirect|backHref)\s*[=(:]\s*(?:\{\s*)?['"`]\/dev(?=\/|[/?#"'`]|$)/;

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasDevPath(text) {
	DEV_PATH_RE.lastIndex = 0;
	return DEV_PATH_RE.test(text);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasDevLink(text) {
	return LINK_RE.test(text);
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isDevRouteId(id) {
	return id === '/dev' || id.startsWith('/dev/');
}

/**
 * @param {string} outputRoot
 * @returns {string[]}
 */
export function collectProdDevLeaks(outputRoot) {
	const leaks = [];
	if (!existsSync(outputRoot)) {
		leaks.push(`missing production output: ${outputRoot}`);
		return leaks;
	}

	const serverManifest = join(outputRoot, 'server/manifest.js');
	if (existsSync(serverManifest)) {
		const text = readFileSync(serverManifest, 'utf8');
		for (const m of text.matchAll(/id:\s*"([^"]+)"/g)) {
			if (isDevRouteId(m[1])) leaks.push(`server manifest route ${m[1]}`);
		}
		if (/src\/routes\/dev\b/.test(text) || /routes\/dev\//.test(text)) {
			leaks.push('server manifest references src/routes/dev');
		}
	}

	const clientDir = join(outputRoot, 'client');
	const viteManifest = join(clientDir, '.vite/manifest.json');
	if (existsSync(viteManifest)) {
		const man = JSON.parse(readFileSync(viteManifest, 'utf8'));
		for (const key of Object.keys(man)) {
			if (/(^|[\\/])routes[\\/]dev[\\/]/.test(key) || /src\/routes\/dev\b/.test(key)) {
				leaks.push(`client vite manifest key ${key}`);
			}
		}
	}

	if (existsSync(clientDir)) scanFiles(clientDir, leaks, { linksOnly: false });

	return leaks;
}

/**
 * @param {string} dir
 * @param {string[]} leaks
 * @param {{ linksOnly?: boolean }} opts
 */
function scanFiles(dir, leaks, opts) {
	const skipExt = new Set([
		'.map',
		'.woff',
		'.woff2',
		'.png',
		'.ico',
		'.jpg',
		'.jpeg',
		'.webp',
		'.gif'
	]);
	const textExt = new Set(['.js', '.css', '.html', '.json', '.txt', '.svg']);
	/** @param {string} p */
	function walk(p) {
		for (const name of readdirSync(p)) {
			if (name === '.map' || name.endsWith('.map')) continue;
			const fp = join(p, name);
			const st = statSync(fp);
			if (st.isDirectory()) {
				walk(fp);
				continue;
			}
			const dot = name.lastIndexOf('.');
			const ext = dot >= 0 ? name.slice(dot) : '';
			if (skipExt.has(ext)) continue;
			if (!textExt.has(ext) && ext !== '') continue;
			const text = readFileSync(fp, 'utf8');
			const rel = fp;
			if (opts.linksOnly) {
				if (hasDevLink(text)) leaks.push(`link to /dev in ${rel}`);
			} else {
				if (/src\/routes\/dev\b/.test(text) || /(?:^|[\\/])routes[\\/]dev[\\/]/.test(text)) {
					leaks.push(`/dev route path in ${rel}`);
				}
				if (hasDevLink(text)) leaks.push(`link to /dev in ${rel}`);
				// Bare /dev path strings that are not pages.dev / /devices
				if (hasDevPath(text) && hasDevLink(text) === false) {
					// Allow residual comments? Client assets should not mention /dev paths at all
					// except if a minified helper survived. Flag pathname strings.
					const hits = text.match(DEV_PATH_RE) ?? [];
					const real = hits.filter((h) => !h.includes('pages.dev'));
					if (real.length) leaks.push(`/dev path string in ${rel}`);
				}
			}
		}
	}
	walk(dir);
}

function main() {
	const root = process.argv[2] || join(process.cwd(), '.svelte-kit/output');
	const leaks = collectProdDevLeaks(root);
	if (leaks.length) {
		console.error('production output contains /dev routes or links:\n' + leaks.join('\n'));
		process.exit(1);
	}
	console.log('OK: production output has no /dev routes or /dev links');
}

const isMain =
	import.meta.url === `file://${process.argv[1]}` ||
	process.argv[1]?.endsWith('check-prod-no-dev.mjs');
if (isMain && process.argv[1] && process.argv[1].includes('check-prod-no-dev')) main();
