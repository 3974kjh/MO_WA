import { describe, expect, it } from 'vitest';
import {
	assertDbWhoami,
	isAllowedMcpSmokeHost,
	parseSmokeAllowedHosts,
	REFUSED_PAGES_ALIASES
} from './mcp-smoke-guard.mjs';

/** Fake / example 8-hex label — not a live operational host. */
const FAKE_HEX_HOST = 'a766e1b8.mo-wa.pages.dev';
const OTHER_HEX_HOST = 'deadbeef.mo-wa.pages.dev';

describe('isAllowedMcpSmokeHost (branch-alias allowlist)', () => {
	it.each(['localhost', '127.0.0.1', '::1', 'LOCALHOST'])('allows loopback %s', (host) => {
		expect(isAllowedMcpSmokeHost(host)).toBe(true);
	});

	it('allows branch-alias Preview host', () => {
		expect(isAllowedMcpSmokeHost('cursor-be-04-db-auth.mo-wa.pages.dev')).toBe(true);
	});

	it('refuses 8-hex unique-deployment host by default', () => {
		expect(isAllowedMcpSmokeHost(FAKE_HEX_HOST)).toBe(false);
		expect(isAllowedMcpSmokeHost(OTHER_HEX_HOST)).toBe(false);
	});

	it('allows a listed Preview hash via MCP_SMOKE_ALLOWED_HOSTS', () => {
		expect(
			isAllowedMcpSmokeHost(FAKE_HEX_HOST, {
				env: { MCP_SMOKE_ALLOWED_HOSTS: FAKE_HEX_HOST }
			})
		).toBe(true);
	});

	it('still refuses an unlisted 8-hex host when allowlist is set', () => {
		expect(
			isAllowedMcpSmokeHost(OTHER_HEX_HOST, {
				env: { MCP_SMOKE_ALLOWED_HOSTS: FAKE_HEX_HOST }
			})
		).toBe(false);
	});

	it('parseSmokeAllowedHosts treats empty/default as no extras', () => {
		expect(parseSmokeAllowedHosts({}).size).toBe(0);
		expect(parseSmokeAllowedHosts({ MCP_SMOKE_ALLOWED_HOSTS: '' }).size).toBe(0);
		expect(parseSmokeAllowedHosts({ MCP_SMOKE_ALLOWED_HOSTS: '  ' }).size).toBe(0);
	});

	it('refuses production apex', () => {
		expect(isAllowedMcpSmokeHost('mo-wa.pages.dev')).toBe(false);
	});

	it.each([...REFUSED_PAGES_ALIASES])('refuses production alias %s.mo-wa.pages.dev', (alias) => {
		expect(isAllowedMcpSmokeHost(`${alias}.mo-wa.pages.dev`)).toBe(false);
	});

	it('refuses www and main even if listed in MCP_SMOKE_ALLOWED_HOSTS', () => {
		// Reserved aliases stay refused — only 8-hex can opt-in via the env.
		expect(
			isAllowedMcpSmokeHost('main.mo-wa.pages.dev', {
				env: { MCP_SMOKE_ALLOWED_HOSTS: 'main.mo-wa.pages.dev' }
			})
		).toBe(false);
		expect(
			isAllowedMcpSmokeHost('www.mo-wa.pages.dev', {
				env: { MCP_SMOKE_ALLOWED_HOSTS: 'www.mo-wa.pages.dev' }
			})
		).toBe(false);
	});

	it('refuses non-project and multi-label hosts', () => {
		expect(isAllowedMcpSmokeHost('evil.example')).toBe(false);
		expect(isAllowedMcpSmokeHost('preview.other.pages.dev')).toBe(false);
		expect(isAllowedMcpSmokeHost('a.b.mo-wa.pages.dev')).toBe(false);
		expect(isAllowedMcpSmokeHost('mo-wa.pages.dev.evil.com')).toBe(false);
	});
});

describe('assertDbWhoami (Low 1)', () => {
	it('fails when auth_mode is env', () => {
		const r = assertDbWhoami(
			{ auth_mode: 'env', bot: 'spike', bot_client_id: 'x', scopes: [] },
			'spike'
		);
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/auth_mode/);
	});

	it('fails when bot does not match MCP_WHOAMI_BOT', () => {
		const r = assertDbWhoami(
			{ auth_mode: 'db', bot: 'other-bot', bot_client_id: 'x', scopes: [] },
			'local-bot'
		);
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/MCP_WHOAMI_BOT|bot/);
	});

	it('fails when MCP_WHOAMI_BOT missing', () => {
		const r = assertDbWhoami(
			{ auth_mode: 'db', bot: 'local-bot', bot_client_id: 'x', scopes: [] },
			''
		);
		expect(r.ok).toBe(false);
	});

	it('passes only for auth_mode=db and matching bot', () => {
		const r = assertDbWhoami(
			{ auth_mode: 'db', bot: 'local-bot', bot_client_id: 'bbbb', scopes: ['read'] },
			'local-bot'
		);
		expect(r.ok).toBe(true);
	});
});
