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

	it('Low-4: BOT_CLIENT_PUBLIC_COLUMNS parsed list must not include key_hash', () => {
		const repo = readFileSync(
			join(process.cwd(), 'src/lib/server/repo/botClients.repo.ts'),
			'utf8'
		);
		const m = /export const BOT_CLIENT_PUBLIC_COLUMNS\s*=\s*'([^']+)'/.exec(repo);
		expect(m).toBeTruthy();
		const cols = m![1]!.split(',').map((s) => s.trim());
		expect(cols.length).toBeGreaterThan(5);
		expect(cols).toContain('key_prefix');
		expect(cols).toContain('id');
		// Must fail if key_hash is added to the constant (regex-only checks can still pass).
		expect(cols).not.toContain('key_hash');
		expect(cols.some((c) => c === 'key_hash' || c.endsWith('key_hash'))).toBe(false);
	});

	it('Low-1: issue wires setHeaders and settings issue form uses enhance', () => {
		const server = readFileSync(
			join(process.cwd(), 'src/routes/(app)/settings/+page.server.ts'),
			'utf8'
		);
		const page = readFileSync(
			join(process.cwd(), 'src/routes/(app)/settings/+page.svelte'),
			'utf8'
		);
		const actions = readFileSync(
			join(process.cwd(), 'src/lib/server/web/botKeyActions.ts'),
			'utf8'
		);
		expect(server).toMatch(/setHeaders/);
		expect(server).toMatch(/handleIssueBotKey\([\s\S]*\{\s*setHeaders\s*\}/);
		expect(actions).toMatch(/cache-control['"]:\s*['"]no-store['"]/);
		expect(page).toMatch(/from '\$app\/forms'/);
		// 발급 폼 자체가 enhance를 써야 한다(주석·다른 폼의 use:enhance로는 통과하지 않게, BE-12 N-5).
		expect(page).toMatch(/<form\b[^>]*data-testid="bot-issue-form"[^>]*use:enhance=\{kstEnhance\}/);
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
