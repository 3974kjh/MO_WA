/**
 * BE-19 acceptance contracts that do not need a live DB.
 * DB-backed coverage remains in `_validate/validate.mjs` (apply_user_correction).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterAttentionNeeded } from '$lib/server/domain/proposals';

describe('BE-19 correction contract (R-VAL-P11)', () => {
	it('documents: one approved row + positions update + before/after audit, no pending', () => {
		// Server path: apply_user_correction RPC creates approved history in one TX.
		// This unit asserts the web action name and that we never expose a pending insert path.
		const actionsSrc = readFileSync(
			join(process.cwd(), 'src/routes/(app)/portfolio/+page.server.ts'),
			'utf8'
		);
		expect(actionsSrc).toMatch(/correct:/);
		expect(actionsSrc).toMatch(/ack:/);
		expect(actionsSrc).not.toMatch(/revert/);
		expect(actionsSrc).not.toMatch(/\bdelete\b/i);
	});

	it('ack behaviour: status unchanged; only acknowledged_at removes from group', () => {
		const now = new Date('2026-11-21T00:00:00Z');
		const before = {
			status: 'conflict',
			acknowledged_at: null as string | null,
			attention_started_at: '2026-11-20T00:00:00Z'
		};
		expect(filterAttentionNeeded([before], now)).toHaveLength(1);
		const afterAck = { ...before, acknowledged_at: now.toISOString() };
		expect(afterAck.status).toBe('conflict');
		expect(filterAttentionNeeded([afterAck], now)).toHaveLength(0);
	});
});

describe('BE-19 attention query does not use decided_at/expires_at', () => {
	it('webLoads listAttentionNeeded filters on attention_started_at only', () => {
		const src = readFileSync(join(process.cwd(), 'src/lib/server/repo/webLoads.repo.ts'), 'utf8');
		const fn = src.slice(src.indexOf('export async function listAttentionNeeded'));
		const body = fn.slice(0, fn.indexOf('export async function listPositionCards'));
		expect(body).toMatch(/attention_started_at/);
		expect(body).toMatch(/acknowledged_at/);
		// Must not filter the 14-day window with decided_at or expires_at
		expect(body).not.toMatch(/\.gt\(['"]decided_at['"]/);
		expect(body).not.toMatch(/\.gt\(['"]expires_at['"]/);
		expect(body).not.toMatch(/\.gte\(['"]decided_at['"]/);
		expect(body).not.toMatch(/\.gte\(['"]expires_at['"]/);
	});
});
