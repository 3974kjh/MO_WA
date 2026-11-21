import { describe, expect, it } from 'vitest';
import { forBot, serverCreateStamps, stripClientIdentity, type BotRepoIdentity } from './client';
import { pickPatchable, POSITION_PATCHABLE, SYSTEM_PATCH_BLOCKLIST } from './patch';

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

	it('strips all proposed_by* fields including proposed_by_user (M-2)', () => {
		const safe = stripClientIdentity({
			title: 't',
			owner_id: 'spoof',
			source_bot_id: 'spoof-bot',
			display_id: 'P-9999',
			display_no: 9999,
			proposed_by_type: 'user',
			proposed_by: 'x',
			proposed_by_user: 'u1',
			proposed_by_user_id: 'u2',
			proposed_by_bot_id: 'b1'
		});
		expect(safe).toEqual({ title: 't' });
		expect(Object.keys(safe).some((k) => k.startsWith('proposed_by'))).toBe(false);
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
			{
				memo: 'm',
				qty: 1,
				archived_at: 'x',
				version: 2,
				evil: true,
				proposed_by_user: 'nope'
			},
			POSITION_PATCHABLE
		);
		expect(patch).toEqual({ memo: 'm', qty: 1 });
	});

	it('forBot accepts BotRepoIdentity only (M-4)', () => {
		const identity: BotRepoIdentity = { ownerId: 'o', botClientId: 'b' };
		// Pair DB lookup is BE-04; this call only structures identity. Admin throws without env.
		expect(() => forBot(identity)).toThrow(/SUPABASE|placeholder|configured|required/i);
	});
});
