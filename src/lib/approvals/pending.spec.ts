import { describe, expect, it } from 'vitest';
import { countPending } from './pending';
import { fixtureProposals } from '$lib/fixtures/proposals';

describe('대기 pill 건수 (G-1)', () => {
	it('pending만 센다 — on_hold(보류)·처리됨은 제외', () => {
		expect(
			countPending([
				{ status: 'pending' },
				{ status: 'on_hold' },
				{ status: 'pending' },
				{ status: 'approved' },
				{ status: 'rejected' },
				{ status: 'superseded' },
				{ status: 'expired' }
			])
		).toBe(2);
	});
	it('픽스처: GOOGL·NAVER 대기 2, KT 보류는 제외', () => {
		expect(countPending(fixtureProposals)).toBe(2);
	});
	it('빈 목록은 0', () => {
		expect(countPending([])).toBe(0);
	});
});
