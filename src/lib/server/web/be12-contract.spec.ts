import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BE-12 route contracts', () => {
	it('settings exposes issue/revoke/setExpiry/setRateLimit and no delete', () => {
		const src = readFileSync(
			join(process.cwd(), 'src/routes/(app)/settings/+page.server.ts'),
			'utf8'
		);
		for (const name of ['issue', 'revoke', 'setExpiry', 'setRateLimit']) {
			expect(src).toMatch(new RegExp(`${name}:`));
		}
		expect(src).not.toMatch(/\bdelete\s*:/);
		expect(src).toMatch(/listBotClients/);
		expect(src).toMatch(/countAuditRuleIds/);
	});

	it('list/load path never selects key_hash', () => {
		const repo = readFileSync(
			join(process.cwd(), 'src/lib/server/repo/botClients.repo.ts'),
			'utf8'
		);
		expect(repo).toMatch(/BOT_CLIENT_PUBLIC_COLUMNS/);
		expect(repo).not.toMatch(/select\([^)]*key_hash/);
		expect(repo).toMatch(/issue_bot_client/);
	});

	it('issue action documents one-time apiKey field', () => {
		const actions = readFileSync(
			join(process.cwd(), 'src/lib/server/web/botKeyActions.ts'),
			'utf8'
		);
		expect(actions).toMatch(/apiKey:/);
		expect(actions).toMatch(/hmacSha256Hex/);
		expect(actions).toMatch(/generateBotApiKey/);
	});

	it('never logs apiKey / secret / key_hash (no console.* of plaintext)', () => {
		const actions = readFileSync(
			join(process.cwd(), 'src/lib/server/web/botKeyActions.ts'),
			'utf8'
		);
		expect(actions).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*apiKey/);
		expect(actions).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*secret/);
		expect(actions).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*key_hash/);
		expect(actions).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*generated\.key/);
	});

	it('revoke / setExpiry / setRateLimit use forUser (not service_role/admin)', () => {
		const actions = readFileSync(
			join(process.cwd(), 'src/lib/server/web/botKeyActions.ts'),
			'utf8'
		);
		const repo = readFileSync(
			join(process.cwd(), 'src/lib/server/repo/botClients.repo.ts'),
			'utf8'
		);
		expect(actions).toMatch(/forUser\(/);
		expect(actions).not.toMatch(/createSupabaseAdminClient|supabase\/admin/);
		expect(repo).not.toMatch(/createSupabaseAdminClient|supabase\/admin/);
		expect(repo).toMatch(/fromRepo\(repo, 'bot_clients'\)/);
	});

	it('migration issue_bot_client exists with rollback header', () => {
		const sql = readFileSync(
			join(process.cwd(), 'supabase/migrations/20261125130000_issue_bot_client.sql'),
			'utf8'
		);
		expect(sql).toMatch(/issue_bot_client/);
		expect(sql).toMatch(/Rollback/i);
		expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.issue_bot_client/);
		expect(sql).toMatch(/grant execute[\s\S]*to authenticated/i);
		expect(sql).toMatch(/revoke all[\s\S]*service_role/i);
	});
});
