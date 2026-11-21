import { describe, expect, it } from 'vitest';
import {
	ATTENTION_WINDOW_MS,
	attentionNeededFilter,
	filterAttentionNeeded,
	isInAttentionGroup
} from './attention';

describe('BE-19 확인 필요 — attention_started_at window (R-PERM-13)', () => {
	const now = new Date('2026-11-21T12:00:00+09:00');

	it('includes conflict/expired with null acknowledged_at within 14 days of attention_started_at', () => {
		const recent = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
		expect(
			isInAttentionGroup(
				{
					status: 'conflict',
					acknowledged_at: null,
					attention_started_at: recent
				},
				now
			)
		).toBe(true);
		expect(
			isInAttentionGroup(
				{
					status: 'expired',
					acknowledged_at: null,
					attention_started_at: recent
				},
				now
			)
		).toBe(true);
	});

	it('excludes acknowledged rows and non-attention statuses', () => {
		const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
		expect(
			isInAttentionGroup(
				{
					status: 'conflict',
					acknowledged_at: now.toISOString(),
					attention_started_at: recent
				},
				now
			)
		).toBe(false);
		expect(
			isInAttentionGroup(
				{
					status: 'pending',
					acknowledged_at: null,
					attention_started_at: recent
				},
				now
			)
		).toBe(false);
	});

	it('excludes rows older than 14 days by attention_started_at', () => {
		const old = new Date(now.getTime() - ATTENTION_WINDOW_MS - 1000).toISOString();
		expect(
			isInAttentionGroup(
				{
					status: 'conflict',
					acknowledged_at: null,
					attention_started_at: old
				},
				now
			)
		).toBe(false);
	});

	it('DEFECT guard: decided_at / expires_at must NOT drive the 14-day window', () => {
		// attention_started_at is old → out of group, even if decided_at/expires_at are fresh
		const oldAttention = new Date(now.getTime() - ATTENTION_WINDOW_MS - 60_000).toISOString();
		const fresh = now.toISOString();
		expect(
			isInAttentionGroup(
				{
					status: 'conflict',
					acknowledged_at: null,
					attention_started_at: oldAttention,
					decided_at: fresh,
					expires_at: fresh
				},
				now
			)
		).toBe(false);

		// attention_started_at is fresh → in group, even if decided_at/expires_at are ancient
		const recentAttention = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
		const ancient = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
		expect(
			isInAttentionGroup(
				{
					status: 'expired',
					acknowledged_at: null,
					attention_started_at: recentAttention,
					decided_at: ancient,
					expires_at: ancient
				},
				now
			)
		).toBe(true);
	});

	it('filterAttentionNeeded ignores decided_at/expires_at columns', () => {
		const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
		const old = new Date(now.getTime() - ATTENTION_WINDOW_MS - 1).toISOString();
		const rows = [
			{
				id: 'in',
				status: 'conflict',
				acknowledged_at: null,
				attention_started_at: recent,
				decided_at: old,
				expires_at: old
			},
			{
				id: 'out-by-attention',
				status: 'conflict',
				acknowledged_at: null,
				attention_started_at: old,
				decided_at: recent,
				expires_at: recent
			}
		];
		const filtered = filterAttentionNeeded(rows, now);
		expect(filtered.map((r) => r.id)).toEqual(['in']);
	});

	it('attentionNeededFilter SQL params use attention_started_at cutoff only', () => {
		const f = attentionNeededFilter(now);
		expect(f.statuses).toEqual(['conflict', 'expired']);
		expect(f.acknowledgedAtIs).toBeNull();
		expect(Date.parse(f.attentionStartedAfter)).toBe(now.getTime() - ATTENTION_WINDOW_MS);
		// ensure shape has no decided_at / expires_at keys
		expect(Object.keys(f).sort()).toEqual([
			'acknowledgedAtIs',
			'attentionStartedAfter',
			'statuses'
		]);
	});
});
