import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SCOPES_BY_PROFILE,
	defaultScopesForProfile,
	FINANCE_MANAGER_ONLY_SCOPES,
	isBotProfile,
	scopesRequireFinanceManager
} from './botProfiles';

describe('botProfiles (BE-12 / design §5-2)', () => {
	it('finance-manager defaults include equity_analysis and propose scopes', () => {
		const scopes = defaultScopesForProfile('finance-manager');
		expect(scopes).toContain('reports:equity_analysis');
		expect(scopes).toContain('positions:propose');
		expect(scopes).toContain('principles:propose');
	});

	it('finance-manager defaults exclude valuations:write and principles:write', () => {
		const scopes = defaultScopesForProfile('finance-manager');
		expect(scopes).not.toContain('valuations:write');
		expect(scopes).not.toContain('principles:write');
	});

	it('propose scopes require finance-manager', () => {
		for (const s of FINANCE_MANAGER_ONLY_SCOPES) {
			expect(scopesRequireFinanceManager([s])).toBe(true);
		}
		expect(scopesRequireFinanceManager(['read', 'valuations:write'])).toBe(false);
	});

	it('importer default is import:all only', () => {
		expect(DEFAULT_SCOPES_BY_PROFILE.importer).toEqual(['import:all']);
	});

	it('isBotProfile accepts known profiles only', () => {
		expect(isBotProfile('finance-manager')).toBe(true);
		expect(isBotProfile('Finance-Manager')).toBe(false);
		expect(isBotProfile('other')).toBe(false);
	});
});
