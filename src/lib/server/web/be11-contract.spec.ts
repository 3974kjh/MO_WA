import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BE-11 route contracts', () => {
	it('redirects /approvals → /portfolio#queue', () => {
		const src = readFileSync(join(process.cwd(), 'src/routes/approvals/+page.ts'), 'utf8');
		expect(src).toMatch(/\/portfolio#queue/);
	});

	it('portfolio actions expose approve/reject/hold/archive/restore and no delete', () => {
		const src = readFileSync(
			join(process.cwd(), 'src/routes/(app)/portfolio/+page.server.ts'),
			'utf8'
		);
		for (const name of ['approve', 'reject', 'hold', 'archive', 'restore']) {
			expect(src).toMatch(new RegExp(`${name}:`));
		}
		expect(src).not.toMatch(/\bdelete\s*:/);
	});

	it('layout pendingCount uses pending-only counter (not fixtures)', () => {
		const src = readFileSync(join(process.cwd(), 'src/routes/(app)/+layout.server.ts'), 'utf8');
		expect(src).toMatch(/countPendingProposals/);
		expect(src).not.toMatch(/fixtureProposals/);
	});
});
