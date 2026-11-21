/**
 * Domain validation public API.
 *
 * M-5 boundary: call `runRules` from MCP tools (BE-06+) and web form/RPC only —
 * never from `src/lib/server/repo/*` create/update. Mode: general key → `strict`;
 * scope `import:all` → `migration`.
 */
export {
	CONSTRAINT_TO_RULE_ID,
	UNMAPPED_MARKER,
	extractConstraintName,
	extractRuleIdsFromMessage,
	mapConstraintToRuleId,
	mapDbErrorToRuleIds,
	unmappedMarker,
	type DbErrorLike
} from './mapDbError';
export {
	domainRules,
	ruleJ02,
	ruleJ08,
	ruleM03,
	ruleP09,
	ruleR04,
	ruleR12,
	ruleR13,
	ruleR14,
	ruleR15,
	runRules,
	shouldHoldJournalForDbChecks,
	validateBuyPlanMeta
} from './rules';
export type {
	ValidationIssue,
	ValidationLevel,
	ValidationMode,
	ValidationResult,
	ValidationRule
} from './types';
