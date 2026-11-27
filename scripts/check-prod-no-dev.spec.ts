import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectProdDevLeaks, hasDevLink, hasDevPath, isDevRouteId } from './check-prod-no-dev.mjs';
import {
	installDevRouteOmit,
	isDevRouteDirName,
	shouldOmitDevRoutes
} from './prod-omit-dev-routes.mjs';

const temps: string[] = [];
function fakeOutput() {
	const dir = mkdtempSync(join(tmpdir(), 'prod-no-dev-'));
	temps.push(dir);
	mkdirSync(join(dir, 'server'), { recursive: true });
	mkdirSync(join(dir, 'client/.vite'), { recursive: true });
	return dir;
}
afterEach(() => {
	for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('shouldOmitDevRoutes / isDevRouteDirName', () => {
	it('omits only when CF_PAGES=1', () => {
		expect(shouldOmitDevRoutes({})).toBe(false);
		expect(shouldOmitDevRoutes({ CF_PAGES: '0' })).toBe(false);
		expect(shouldOmitDevRoutes({ CF_PAGES: '1' })).toBe(true);
	});
	it('skips only the dev directory name', () => {
		expect(isDevRouteDirName('dev')).toBe(true);
		expect(isDevRouteDirName('demo')).toBe(false);
		expect(isDevRouteDirName('devices')).toBe(false);
		expect(isDevRouteDirName('(app)')).toBe(false);
	});
});

describe('dev path / link detectors', () => {
	it('matches /dev and /dev/* but not pages.dev or /devices', () => {
		expect(hasDevPath('id: "/dev/components"')).toBe(true);
		expect(hasDevPath("goto('/dev')")).toBe(true);
		expect(hasDevPath('https://mo-wa.pages.dev/login')).toBe(false);
		expect(hasDevPath('href="/devices"')).toBe(false);
		expect(hasDevPath('href="/developer"')).toBe(false);
		expect(isDevRouteId('/dev')).toBe(true);
		expect(isDevRouteId('/dev/shell')).toBe(true);
		expect(isDevRouteId('/devices')).toBe(false);
		expect(isDevRouteId('/login')).toBe(false);
	});
	it('detects href/goto/resolve links to /dev', () => {
		expect(hasDevLink('<a href="/dev/shell">')).toBe(true);
		expect(hasDevLink("href={resolve('/dev/shell')}")).toBe(true);
		expect(hasDevLink("goto('/dev')")).toBe(true);
		expect(hasDevLink('href="https://mo-wa.pages.dev/x"')).toBe(false);
		expect(hasDevLink('href="/devices"')).toBe(false);
	});
});

describe('collectProdDevLeaks', () => {
	it('is clean when production output has no /dev routes or links', () => {
		const root = fakeOutput();
		writeFileSync(
			join(root, 'server/manifest.js'),
			'export const manifest = { routes: [{ id: "/" }, { id: "/login" }, { id: "/portfolio" }] };'
		);
		writeFileSync(
			join(root, 'client/.vite/manifest.json'),
			JSON.stringify({ 'src/routes/login/+page.svelte': { file: 'x.js' } })
		);
		writeFileSync(
			join(root, 'client/app.js'),
			'const u="https://mo-wa.pages.dev/login"; const d="/devices";'
		);
		expect(collectProdDevLeaks(root)).toEqual([]);
	});

	it('fails when the server manifest still lists a /dev route', () => {
		const root = fakeOutput();
		writeFileSync(
			join(root, 'server/manifest.js'),
			'export const manifest = { routes: [{ id: "/login" }, { id: "/dev/components" }] };'
		);
		writeFileSync(join(root, 'client/.vite/manifest.json'), '{}');
		expect(collectProdDevLeaks(root).some((l) => l.includes('/dev/components'))).toBe(true);
	});

	it('fails when the client vite manifest includes a /dev route module', () => {
		const root = fakeOutput();
		writeFileSync(
			join(root, 'server/manifest.js'),
			'export const manifest = { routes: [{ id: "/login" }] };'
		);
		writeFileSync(
			join(root, 'client/.vite/manifest.json'),
			JSON.stringify({ 'src/routes/dev/shell/+page.svelte': { file: 'nodes/18.js' } })
		);
		expect(collectProdDevLeaks(root).some((l) => l.includes('src/routes/dev'))).toBe(true);
	});

	it('fails when a client asset links to /dev', () => {
		const root = fakeOutput();
		writeFileSync(
			join(root, 'server/manifest.js'),
			'export const manifest = { routes: [{ id: "/login" }] };'
		);
		writeFileSync(join(root, 'client/.vite/manifest.json'), '{}');
		writeFileSync(join(root, 'client/chunk.js'), 'export const href="/dev/shell";');
		expect(
			collectProdDevLeaks(root).some((l) => l.includes('link to /dev') || l.includes('/dev path'))
		).toBe(true);
	});

	it('does not treat pages.dev hosts as /dev routes', () => {
		const root = fakeOutput();
		writeFileSync(
			join(root, 'server/manifest.js'),
			'export const manifest = { routes: [{ id: "/login" }] };'
		);
		writeFileSync(join(root, 'client/.vite/manifest.json'), '{}');
		writeFileSync(join(root, 'client/chunk.js'), 'fetch("https://mo-wa.pages.dev/api/mcp")');
		expect(collectProdDevLeaks(root)).toEqual([]);
	});
});

describe('installDevRouteOmit', () => {
	it('hides only src/routes/dev when CF_PAGES=1, and uninstall restores it', async () => {
		const cwd = fakeOutput();
		const routes = join(cwd, 'src/routes');
		mkdirSync(join(routes, 'dev'), { recursive: true });
		mkdirSync(join(routes, 'login'), { recursive: true });
		mkdirSync(join(routes, 'demo'), { recursive: true });
		writeFileSync(join(routes, 'dev/+page.svelte'), '');
		const fs = (await import('node:fs')).default;
		const before = fs.readdirSync(routes).sort();
		expect(before).toEqual(['demo', 'dev', 'login']);
		const uninstall = installDevRouteOmit(cwd, { CF_PAGES: '1' });
		expect(fs.readdirSync(routes).sort()).toEqual(['demo', 'login']);
		// other directories are not filtered
		expect(fs.readdirSync(join(routes, 'dev'))).toContain('+page.svelte');
		uninstall();
		expect(fs.readdirSync(routes).sort()).toEqual(['demo', 'dev', 'login']);
	});
	it('does not patch fs when CF_PAGES is unset', () => {
		const cwd = fakeOutput();
		const routes = join(cwd, 'src/routes');
		mkdirSync(join(routes, 'dev'), { recursive: true });
		const uninstall = installDevRouteOmit(cwd, {});
		expect(readdirSync(routes)).toContain('dev');
		uninstall();
	});
});
