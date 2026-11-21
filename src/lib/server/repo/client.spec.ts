import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as repoIndex from './index';
import * as mcpAuth from '../mcp/auth';
import {
	forBot,
	forUser,
	serverCreateStamps,
	stripClientIdentity,
	type RepoClient
} from './client';
import { mintBotRepoIdentity, isBotRepoIdentity } from './botIdentityBrand';
import { pickPatchable, POSITION_PATCHABLE, SYSTEM_PATCH_BLOCKLIST } from './patch';
import { restoreRow, archiveRow } from './archive';

describe('repo identity stamps (R-SYS-01, R-PERM-03)', () => {
	it('server fills owner_id and source_bot_id for bot', () => {
		expect(
			serverCreateStamps({
				kind: 'bot',
				ownerId: 'owner-1',
				botClientId: 'bot-9'
			})
		).toEqual({ owner_id: 'owner-1', source_bot_id: 'bot-9' });
	});

	it('user writes have null source_bot_id', () => {
		expect(
			serverCreateStamps({
				kind: 'user',
				ownerId: 'owner-1',
				botClientId: null
			})
		).toEqual({ owner_id: 'owner-1', source_bot_id: null });
	});
});

describe('repo identity / M-4', () => {
	it('does not export getRepoDb, REPO_DB, or mint from public surfaces', () => {
		expect('getRepoDb' in repoIndex).toBe(false);
		expect('REPO_DB' in repoIndex).toBe(false);
		expect('mintBotRepoIdentity' in repoIndex).toBe(false);
		expect('fromRepo' in repoIndex).toBe(false);
		expect('mintBotRepoIdentity' in mcpAuth).toBe(false);
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
		expect(Object.isFrozen(repo)).toBe(true);
		expect(Object.isFrozen(repo.actor)).toBe(true);
		expect('db' in repo).toBe(false);
		expect((repo as RepoClient & { db?: unknown }).db).toBeUndefined();

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

	it('bindRepoDb refuses to overwrite an already-bound RepoClient', async () => {
		const { bindRepoDb } = await import('./db');
		const fakeDb = { from: () => ({}) } as never;
		const repo = forUser(fakeDb, 'owner-1');
		expect(() => bindRepoDb(repo, fakeDb)).toThrow(/already bound/i);
	});

	it('rejects plain objects, Symbol brands, spreads, and post-mint mutation for forBot', () => {
		expect(() =>
			forBot({ ownerId: 'o', botClientId: 'b' } as never)
		).toThrow(/minted BotRepoIdentity/i);

		const brand = Symbol('fake');
		expect(() =>
			forBot({ ownerId: 'o', botClientId: 'b', [brand]: brand } as never)
		).toThrow(/minted BotRepoIdentity/i);

		const legit = mintBotRepoIdentity('owner-1', 'bot-9');
		expect(isBotRepoIdentity(legit)).toBe(true);
		expect(Object.isFrozen(legit)).toBe(true);

		const spoofed = { ...legit, ownerId: 'other-owner' };
		expect(isBotRepoIdentity(spoofed)).toBe(false);
		expect(() => forBot(spoofed as never)).toThrow(/minted BotRepoIdentity/i);

		expect(() => {
			(legit as { ownerId: string }).ownerId = 'mutated';
		}).toThrow();
		expect(legit.ownerId).toBe('owner-1');
	});

	it('accepts minted identity and copies values into a frozen RepoClient', () => {
		const identity = mintBotRepoIdentity('owner-1', 'bot-9');
		// Admin config missing in unit env — brand gate passed before admin throws
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

	it('strips server-filled keys on first insert (Low-3)', () => {
		const safe = stripClientIdentity({
			title: 't',
			status: 'approved',
			expires_at: '2026-01-01',
			decided_at: '2026-01-01',
			acknowledged_at: '2026-01-01',
			attention_started_at: '2026-01-01',
			client_ref: 'ref-1'
		});
		expect(safe).toEqual({ title: 't', client_ref: 'ref-1' });
		expect('status' in safe).toBe(false);
		expect('expires_at' in safe).toBe(false);
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
		const mcpMintProbe = join(process.cwd(), 'src/lib/server/mcp/_be03_mint_probe.ts');
		writeFileSync(
			clientProbe,
			`import { forUser } from '$lib/server/repo/client';\nvoid forUser;\n`
		);
		writeFileSync(
			adminProbe,
			`const x = await import(\`$lib/supabase/admin\`);\nvoid x;\n`
		);
		writeFileSync(
			mcpMintProbe,
			`import { mintBotRepoIdentity } from '$lib/server/repo/botIdentityBrand';\nvoid mintBotRepoIdentity;\n`
		);
		try {
			let failed = false;
			try {
				execFileSync(
					'pnpm',
					['exec', 'eslint', clientProbe, adminProbe, mcpMintProbe],
					{ encoding: 'utf8', cwd: process.cwd() }
				);
			} catch (err) {
				failed = true;
				const out = `${(err as { stdout?: string }).stdout ?? ''}${(err as { stderr?: string }).stderr ?? ''}`;
				expect(out).toMatch(/repo\/client|M-4/);
				expect(out).toMatch(/supabase\/admin|R-SYS-01/);
				expect(out).toMatch(/botIdentityBrand|mcp_authenticate|BE-04/);
			}
			expect(failed).toBe(true);
		} finally {
			for (const p of [clientProbe, adminProbe, mcpMintProbe]) {
				try {
					unlinkSync(p);
				} catch {
					/* ignore */
				}
			}
		}
	});
});
