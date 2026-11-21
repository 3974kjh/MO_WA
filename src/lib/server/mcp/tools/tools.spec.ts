import { describe, expect, it } from 'vitest';
import { filterToolsByScopes, SPIKE_TOOL_NAMES, TOOL_REQUIRED_SCOPE } from '../scopes';
import { spikeToolsForContext } from './index';

describe('scope-filtered tools/list (M1-a)', () => {
	it('read key lists whoami, echo, db_ping', () => {
		expect(spikeToolsForContext({ scopes: ['read'] })).toEqual(['whoami', 'echo', 'db_ping']);
	});

	it('empty scopes lists nothing', () => {
		expect(spikeToolsForContext({ scopes: [] })).toEqual([]);
	});

	it('write-only key does not list spike read tools', () => {
		expect(spikeToolsForContext({ scopes: ['journal:write'] })).toEqual([]);
	});

	it('read-only key does not list write tools', () => {
		const writeTools = Object.entries(TOOL_REQUIRED_SCOPE)
			.filter(([, scope]) => scope !== 'read')
			.map(([name]) => name);
		const listed = filterToolsByScopes([...SPIKE_TOOL_NAMES, ...writeTools], {
			scopes: ['read']
		});
		expect(listed).toEqual(['whoami', 'echo', 'db_ping']);
		expect(listed.some((t) => writeTools.includes(t))).toBe(false);
	});

	it('import:all unlocks write tools except proposal tools, and spike reads', () => {
		const listed = filterToolsByScopes(
			[...SPIKE_TOOL_NAMES, 'add_journal_entry', 'propose_position_change'],
			{ scopes: ['import:all'] }
		);
		expect(listed).toContain('whoami');
		expect(listed).toContain('add_journal_entry');
		expect(listed).not.toContain('propose_position_change');
	});
});
