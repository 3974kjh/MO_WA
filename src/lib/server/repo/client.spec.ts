import { describe, expect, it } from 'vitest';
import { serverCreateStamps, stripClientIdentity } from './client';

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

	it('strips client-supplied identity and display_id fields', () => {
		const safe = stripClientIdentity({
			title: 't',
			owner_id: 'spoof',
			source_bot_id: 'spoof-bot',
			display_id: 'P-9999',
			display_no: 9999,
			proposed_by_type: 'user'
		});
		expect(safe).toEqual({ title: 't' });
		expect('owner_id' in safe).toBe(false);
		expect('display_id' in safe).toBe(false);
	});
});
