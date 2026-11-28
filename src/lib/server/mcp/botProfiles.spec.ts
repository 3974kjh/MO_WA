import { describe, expect, it } from 'vitest';
import { OPT_IN_SCOPES as VIEW_OPT_IN_SCOPES } from '$lib/settings/view';
import {
	BOT_PROFILES,
	DEFAULT_SCOPES_BY_PROFILE,
	OPT_IN_SCOPES,
	scopesMixOptIn,
	scopesViolateOptIn,
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

	it('no default profile includes market:feed (granted explicitly at key issue only)', () => {
		for (const scopes of Object.values(DEFAULT_SCOPES_BY_PROFILE)) {
			expect(scopes).not.toContain('market:feed');
		}
		for (const p of BOT_PROFILES) {
			for (const opt of OPT_IN_SCOPES) expect(defaultScopesForProfile(p)).not.toContain(opt);
		}
	});

	it('scopesMixOptIn: market:feed alone is fine, with anything else (even read) is not', () => {
		expect(scopesMixOptIn(['market:feed'])).toBe(false);
		expect(scopesMixOptIn(['market:feed', 'market:feed'])).toBe(false);
		expect(scopesMixOptIn(['market:feed', 'read'])).toBe(true);
		expect(scopesMixOptIn(['read', 'journal:write'])).toBe(false);
	});

	it('opt-in list matches the settings screen and is finance-manager only', () => {
		expect([...OPT_IN_SCOPES]).toEqual([...VIEW_OPT_IN_SCOPES]);
		expect(scopesViolateOptIn(['market:feed'], 'finance-manager')).toBe(false);
		for (const p of ['equity-analyst', 'house-signal', 'importer', 'custom'] as const) {
			expect(scopesViolateOptIn(['market:feed'], p)).toBe(true);
			expect(scopesViolateOptIn(['read'], p)).toBe(false);
		}
	});
});
