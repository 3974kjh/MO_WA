import { describe, expect, it } from 'vitest';
import {
	assertDbWhoami,
	isAllowedMcpSmokeHost,
	REFUSED_PAGES_ALIASES
} from './mcp-smoke-guard.mjs';

describe('isAllowedMcpSmokeHost (Low 2 allowlist)', () => {
	it.each(['localhost', '127.0.0.1', '::1', 'LOCALHOST'])('allows loopback %s', (host) => {
		expect(isAllowedMcpSmokeHost(host)).toBe(true);
	});

	it('allows genuine branch Preview host', () => {
		expect(isAllowedMcpSmokeHost('cursor-be-04-db-auth.mo-wa.pages.dev')).toBe(true);
	});

	it('allows deployment-id Preview host (hash label)', () => {
		expect(isAllowedMcpSmokeHost('eb22954a.mo-wa.pages.dev')).toBe(true);
	});

	it('refuses production apex', () => {
		expect(isAllowedMcpSmokeHost('mo-wa.pages.dev')).toBe(false);
	});

	it.each([...REFUSED_PAGES_ALIASES])('refuses production alias %s.mo-wa.pages.dev', (alias) => {
		expect(isAllowedMcpSmokeHost(`${alias}.mo-wa.pages.dev`)).toBe(false);
	});

	it('refuses www and main explicitly (review examples)', () => {
		expect(isAllowedMcpSmokeHost('www.mo-wa.pages.dev')).toBe(false);
		expect(isAllowedMcpSmokeHost('main.mo-wa.pages.dev')).toBe(false);
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
