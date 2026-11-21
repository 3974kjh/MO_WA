import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as repoIndex from './index';
import { forBot, forUser, stripClientIdentity, type RepoClient } from './client';
import { mintBotRepoIdentity } from './botIdentityBrand';
import { pickPatchable, POSITION_PATCHABLE, SYSTEM_PATCH_BLOCKLIST } from './patch';
import { restoreRow, archiveRow } from './archive';

describe('repo identity / M-4', () => {
	it('does not export getRepoDb or REPO_DB from the public index', () => {
		expect('getRepoDb' in repoIndex).toBe(false);
		expect('REPO_DB' in repoIndex).toBe(false);
		expect('mintBotRepoIdentity' in repoIndex).toBe(false);
	});

	it('stores db only in WeakMap — Symbol/property probe cannot build unscoped select', () => {
		let fromCalled = false;
		const fakeDb = {
			from: (table: string) => {
				fromCalled = true;
				return {
					select: () => ({
						table,
						eq: () => {
							throw new Error('eq should not be reachable via Symbol probe');
						}
					})
				};
			}
		} as never;
		const repo = forUser(fakeDb, 'owner-1');
		expect(Object.keys(repo)).toEqual(['actor']);
		expect(Object.getOwnPropertySymbols(repo)).toEqual([]);
		expect('db' in repo).toBe(false);
		expect((repo as RepoClient & { db?: unknown }).db).toBeUndefined();

		// Symbol-key fishing / Object.values cannot recover the client for from('reports').select('*')
		for (const sym of Object.getOwnPropertySymbols(repo)) {
			const maybe = (repo as Record<symbol, unknown>)[sym] as
				| { from?: (t: string) => { select: (c: string) => unknown } }
				| undefined;
			maybe?.from?.('reports')?.select('*');
		}
		for (const value of Object.values(repo)) {
			const maybe = value as { from?: (t: string) => { select: (c: string) => unknown } };
			if (typeof maybe?.from === 'function') {
				maybe.from('reports').select('*');
			}
		}
		expect(fromCalled).toBe(false);
	});

	it('rejects plain objects for forBot (brand required)', () => {
		expect(() =>
			forBot({ ownerId: 'o', botClientId: 'b' } as never)
		).toThrow(/branded BotRepoIdentity/i);
	});

	it('accepts branded identity shape from mint (auth path)', () => {
		const identity = mintBotRepoIdentity('owner-1', 'bot-9');
		// Admin config missing in unit env — still proves brand gate passed
		expect(() => forBot(identity)).toThrow(/SUPABASE|placeholder|configured|required|Refusing/i);
	});

	it('strips all proposed_by* and proposer aliases (M-2)', () => {
		const safe = stripClientIdentity({
			title: 't',
			proposed_by_type: 'user',
			proposed_by: 'x',
			proposed_by_user: 'u1',
			proposed_by_user_id: 'u2',
			proposed_by_bot_id: 'b1',
			proposer_type: 'bot',
			source_bot_id: 'spoof',
			display_id: 'P-1'
		});
		expect(safe).toEqual({ title: 't' });
		expect(Object.keys(safe).some((k) => k.startsWith('proposed_by'))).toBe(false);
		expect('proposer_type' in safe).toBe(false);
		expect('source_bot_id' in safe).toBe(false);
	});

	it('strips system patch fields (M-3)', () => {
		const safe = stripClientIdentity({
			memo: 'ok',
			id: 'uuid',
			version: 9,
			approval_version: 3,
			archived_at: '2026-01-01',
			created_at: '2026-01-01',
			updated_at: '2026-01-01'
		});
		expect(safe).toEqual({ memo: 'ok' });
		for (const key of SYSTEM_PATCH_BLOCKLIST) {
			expect(key in safe).toBe(false);
		}
	});

	it('pickPatchable keeps only table allowlist fields', () => {
		const patch = pickPatchable(
			{ memo: 'm', qty: 1, archived_at: 'x', version: 2, evil: true },
			POSITION_PATCHABLE
		);
		expect(patch).toEqual({ memo: 'm', qty: 1 });
	});
});

describe('restoreRow actor (Low)', () => {
	it('rejects bot actors without calling the database', async () => {
		const repo = {
			actor: { kind: 'bot' as const, ownerId: 'o', botClientId: 'b' }
		} as RepoClient;
		const result = await restoreRow(repo, 'reports', 'id-1');
		expect(result.error?.message).toMatch(/user actor/i);
	});

	it('rejects empty id for user actors', async () => {
		const fakeDb = {
			from: () => {
				throw new Error('should not query');
			}
		} as never;
		const repo = forUser(fakeDb, 'owner-1');
		const result = await restoreRow(repo, 'reports', '');
		expect(result.error?.message).toMatch(/id is required/i);
	});

	it('fails when id is missing or owner differs (no silent success)', async () => {
		const builder = {
			eq() {
				return this;
			},
			select() {
				return this;
			},
			maybeSingle: async () => ({ data: null, error: null })
		};
		const fakeDb = {
			from: () => ({
				update: () => builder
			})
		} as never;
		const repo = forUser(fakeDb, 'owner-1');
		const restore = await restoreRow(repo, 'reports', 'missing-or-other-owner');
		expect(restore.error?.message).toMatch(/not found|owner/i);
		const archive = await archiveRow(repo, 'reports', 'missing-or-other-owner');
		expect(archive.error?.message).toMatch(/not found|owner/i);
	});
});

describe('ESLint M-4 / L6 restrictions', () => {
	it('blocks direct repo/client import and template-literal admin import', () => {
		const clientProbe = join(process.cwd(), 'src/lib/server/_be03_client_probe.ts');
		const adminProbe = join(process.cwd(), 'src/lib/server/_be03_admin_probe.ts');
		writeFileSync(
			clientProbe,
			`import { forUser } from '$lib/server/repo/client';\nvoid forUser;\n`
		);
		writeFileSync(
			adminProbe,
			`const x = await import(\`$lib/supabase/admin\`);\nvoid x;\n`
		);
		try {
			let failed = false;
			try {
				execFileSync('pnpm', ['exec', 'eslint', clientProbe, adminProbe], {
					encoding: 'utf8',
					cwd: process.cwd()
				});
			} catch (err) {
				failed = true;
				const out = `${(err as { stdout?: string }).stdout ?? ''}${(err as { stderr?: string }).stderr ?? ''}`;
				expect(out).toMatch(/repo\/client|M-4/);
				expect(out).toMatch(/supabase\/admin|R-SYS-01/);
			}
			expect(failed).toBe(true);
		} finally {
			try {
				unlinkSync(clientProbe);
			} catch {
				/* ignore */
			}
			try {
				unlinkSync(adminProbe);
			} catch {
				/* ignore */
			}
		}
	});
});
