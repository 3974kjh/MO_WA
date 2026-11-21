/**
 * Bot client profiles + default scopes (design §5-2 / BE-12).
 * Propose scopes are finance-manager only (DB CHECK + action validation).
 */

export const BOT_PROFILES = [
	'finance-manager',
	'equity-analyst',
	'house-signal',
	'importer',
	'custom'
] as const;

export type BotProfile = (typeof BOT_PROFILES)[number];

/** Scopes that may be granted only when profile=finance-manager. */
export const FINANCE_MANAGER_ONLY_SCOPES = ['positions:propose', 'principles:propose'] as const;

/**
 * Default scopes by profile (design §5-2).
 * finance-manager: includes reports:equity_analysis; no valuations:write / principles:write.
 */
export const DEFAULT_SCOPES_BY_PROFILE: Readonly<Record<BotProfile, readonly string[]>> =
	Object.freeze({
		'finance-manager': Object.freeze([
			'read',
			'reports:daily_brief',
			'reports:weekly_report',
			'reports:strategy',
			'reports:equity_analysis',
			'reports:buy_plan_draft',
			'positions:propose',
			'principles:propose',
			'positions:annotate',
			'journal:write',
			'instruments:write',
			'prices:write',
			'portfolio:snapshot',
			'indicators:write',
			'decisions:write',
			'events:stock',
			'events:macro'
		]),
		'equity-analyst': Object.freeze([
			'read',
			'reports:equity_analysis',
			'reports:buy_plan_draft',
			'instruments:enrich',
			'valuations:write',
			'events:stock'
		]),
		'house-signal': Object.freeze([
			'read',
			'reports:realestate_brief',
			'reports:realestate_analysis',
			'realestate:write',
			'events:realestate'
		]),
		importer: Object.freeze(['import:all']),
		custom: Object.freeze(['read'])
	});

export function isBotProfile(value: string): value is BotProfile {
	return (BOT_PROFILES as readonly string[]).includes(value);
}

export function defaultScopesForProfile(profile: BotProfile): string[] {
	return [...DEFAULT_SCOPES_BY_PROFILE[profile]];
}

/** True when scopes include a propose scope that requires finance-manager. */
export function scopesRequireFinanceManager(scopes: readonly string[]): boolean {
	return FINANCE_MANAGER_ONLY_SCOPES.some((s) => scopes.includes(s));
}
