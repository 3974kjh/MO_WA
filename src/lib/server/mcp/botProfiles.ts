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
 * Scopes never in any profile default: issued only when explicitly requested, and only for the
 * listed profile. `market:feed` = submit_daily_market_feed (daily-feed key, finance-manager only).
 * Keep in sync with OPT_IN_SCOPES in `$lib/settings/view` (spec asserts equality).
 */
export const OPT_IN_SCOPES = ['market:feed'] as const;
export const OPT_IN_SCOPE_PROFILE: BotProfile = 'finance-manager';

/**
 * Default scopes by profile (design §5-2).
 * `market:feed` (submit_daily_market_feed) is intentionally in no default: the daily-feed key is
 * issued with scopes `["market:feed"]` only (mcp-feed-design §3-2).
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

/** Opt-in scopes (market:feed) may only be issued alone — never with read or any other scope. */
export function scopesMixOptIn(scopes: readonly string[]): boolean {
	const set = new Set(scopes);
	return set.size > 1 && [...set].some((s) => (OPT_IN_SCOPES as readonly string[]).includes(s));
}

/** True when scopes include an opt-in scope that this profile may not hold. */
export function scopesViolateOptIn(scopes: readonly string[], profile: BotProfile): boolean {
	return (
		profile !== OPT_IN_SCOPE_PROFILE &&
		scopes.some((s) => (OPT_IN_SCOPES as readonly string[]).includes(s))
	);
}

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
