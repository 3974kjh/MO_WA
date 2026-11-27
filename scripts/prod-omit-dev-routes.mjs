/**
 * Production client builds omit src/routes/dev so /dev/* is not in the
 * route tree or the client JS/CSS.
 *
 * Signal: CF_PAGES=1. Cloudflare Pages Git builds always set this, and this
 * repo's `pnpm build` is `CF_PAGES=1 vite build`, so official production
 * builds (local gates and Pages) take this path. `pnpm dev`, vitest, and
 * svelte-check do not set CF_PAGES, so /dev pages and their tests stay.
 *
 * Mechanism: when the signal is set, filter the `dev` entry out of
 * fs.readdirSync/readdir on `src/routes` only. SvelteKit then never sees
 * that folder. Source files are not moved; hooks, +layout.server, and
 * kit.files.routes stay unchanged.
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

function isDevListing(name) {
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

function isRoutesRoot(dir, routesAbs) {
	try {
		const raw = typeof dir === 'string' ? dir : (dir?.pathname ?? String(dir));
		return path.resolve(raw) === routesAbs;
	} catch {
		return false;
	}
}

/**
 * Install the src/routes filter. Returns an uninstall function.
 * @param {string} [cwd]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function installDevRouteOmit(cwd = process.cwd(), env = process.env) {
	if (!shouldOmitDevRoutes(env)) return () => {};
	const routesAbs = path.resolve(cwd, 'src/routes');
	const origSync = fs.readdirSync;
	const origCb = fs.readdir;
	const origProm = fs.promises.readdir;

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

	function filterIf(result, dir) {
		return isRoutesRoot(dir, routesAbs) ? filterListing(result) : result;
	}

	return function uninstall() {
		fs.readdirSync = origSync;
		fs.readdir = origCb;
		fs.promises.readdir = origProm;
	};
}
