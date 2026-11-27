/**
 * Production client builds omit src/routes/dev so /dev/* is not in the
 * route tree or the client JS/CSS.
 *
 * Signal: CF_PAGES=1. Cloudflare Pages Git builds always set this, and this
 * repo's `pnpm build` is `CF_PAGES=1 vite build && node scripts/check-prod-no-dev.mjs`
 * (Pages Git build command is `pnpm install && pnpm build`, see
 * docs/cloudflare-deploy.md §4). Official production builds run the guard after
 * vite, so a silent filter miss still fails the build. `pnpm dev`, vitest, and
 * svelte-check do not set CF_PAGES, so /dev pages and their tests stay.
 *
 * Mechanism: when the signal is set, filter the `dev` entry out of directory
 * listings of `src/routes` only (readdirSync / readdir / promises.readdir /
 * opendir / opendirSync / promises.opendir, including recursive listings).
 * Scope is strictly `src/routes/dev` — not `src/routes/x/dev` or `(g)/dev`.
 *
 * Named ESM `import { readdirSync } from 'node:fs'` is a live binding that this
 * patch cannot wrap. Kit 2.61.1 uses `import fs from 'node:fs'; fs.readdirSync`.
 * If that changes, the post-build guard still fails the `pnpm build`.
 *
 * Source files are not moved; hooks, +layout.server, and kit.files.routes stay unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEV_ROUTE_DIR = 'dev';

export function shouldOmitDevRoutes(env = process.env) {
	return env.CF_PAGES === '1';
}

export function isDevRouteDirName(name) {
	return name === DEV_ROUTE_DIR;
}

function entryName(entry) {
	return typeof entry === 'string' ? entry : entry.name;
}

/** True for the top-level `dev` folder or recursive paths `dev/...` — not `x/dev`. */
export function isDevListing(name) {
	return (
		isDevRouteDirName(name) ||
		name === 'dev/' ||
		name.startsWith('dev/') ||
		name.startsWith('dev\\')
	);
}

function filterListing(result) {
	if (!Array.isArray(result)) return result;
	return result.filter((entry) => !isDevListing(entryName(entry)));
}

function resolvePath(dir) {
	try {
		const raw = typeof dir === 'string' ? dir : (dir?.pathname ?? String(dir));
		const abs = path.resolve(raw);
		try {
			return fs.realpathSync.native ? fs.realpathSync.native(abs) : fs.realpathSync(abs);
		} catch {
			return abs;
		}
	} catch {
		return '';
	}
}

function isRoutesRoot(dir, routesAbs) {
	const resolved = resolvePath(dir);
	if (!resolved) return false;
	if (resolved === routesAbs) return true;
	try {
		const realRoot = fs.realpathSync.native
			? fs.realpathSync.native(routesAbs)
			: fs.realpathSync(routesAbs);
		return resolved === realRoot;
	} catch {
		return false;
	}
}

function wrapDirentIterator(dir, filter) {
	const origRead = dir.read.bind(dir);
	const origReadSync = typeof dir.readSync === 'function' ? dir.readSync.bind(dir) : null;

	async function readFiltered() {
		let dirent = await origRead();
		while (dirent && filter(dirent.name)) dirent = await origRead();
		return dirent;
	}

	dir.read = function (cb) {
		if (typeof cb === 'function') {
			const go = () => {
				origRead((err, dirent) => {
					if (!err && dirent && filter(dirent.name)) return go();
					cb(err, dirent);
				});
			};
			go();
			return;
		}
		return readFiltered();
	};
	if (origReadSync) {
		dir.readSync = function () {
			let dirent = origReadSync();
			while (dirent && filter(dirent.name)) dirent = origReadSync();
			return dirent;
		};
	}
	return dir;
}

/**
 * Install the src/routes filter. Returns an uninstall function.
 * @param {string} [cwd]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function installDevRouteOmit(cwd = process.cwd(), env = process.env) {
	if (!shouldOmitDevRoutes(env)) return () => {};
	const routesAbs = resolvePath(path.resolve(cwd, 'src/routes')) || path.resolve(cwd, 'src/routes');
	const origSync = fs.readdirSync;
	const origCb = fs.readdir;
	const origProm = fs.promises.readdir;
	const origOpendirSync = fs.opendirSync;
	const origOpendirCb = fs.opendir;
	const origOpendirProm = fs.promises.opendir;

	function filterIf(result, dir) {
		if (!isRoutesRoot(dir, routesAbs)) return result;
		return filterListing(result);
	}

	fs.readdirSync = function (dir, options) {
		return filterIf(origSync.call(this, dir, options), dir);
	};
	fs.readdir = function (dir, options, cb) {
		if (typeof options === 'function') {
			cb = options;
			options = undefined;
		}
		return origCb.call(this, dir, options, (err, result) => {
			if (!err) result = filterIf(result, dir);
			cb(err, result);
		});
	};
	fs.promises.readdir = function (dir, options) {
		return origProm.call(this, dir, options).then((result) => filterIf(result, dir));
	};

	fs.opendirSync = function (dir, options) {
		const d = origOpendirSync.call(this, dir, options);
		return isRoutesRoot(dir, routesAbs) ? wrapDirentIterator(d, isDevListing) : d;
	};
	fs.opendir = function (dir, options, cb) {
		if (typeof options === 'function') {
			cb = options;
			options = undefined;
		}
		if (typeof cb === 'function') {
			return origOpendirCb.call(this, dir, options, (err, d) => {
				if (!err && d && isRoutesRoot(dir, routesAbs)) d = wrapDirentIterator(d, isDevListing);
				cb(err, d);
			});
		}
		return origOpendirCb
			.call(this, dir, options)
			.then((d) => (isRoutesRoot(dir, routesAbs) ? wrapDirentIterator(d, isDevListing) : d));
	};
	fs.promises.opendir = function (dir, options) {
		return origOpendirProm
			.call(this, dir, options)
			.then((d) => (isRoutesRoot(dir, routesAbs) ? wrapDirentIterator(d, isDevListing) : d));
	};

	return function uninstall() {
		fs.readdirSync = origSync;
		fs.readdir = origCb;
		fs.promises.readdir = origProm;
		fs.opendirSync = origOpendirSync;
		fs.opendir = origOpendirCb;
		fs.promises.opendir = origOpendirProm;
	};
}
