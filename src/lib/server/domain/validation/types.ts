/**
 * Domain validation types (design §3-4).
 * Rule functions are shaped `{ id, level, check }` with strict | migration modes.
 */

export type ValidationMode = 'strict' | 'migration';

export type ValidationLevel = 'ERROR' | 'WARN';

export type ValidationIssue = {
	id: string;
	level: ValidationLevel;
	message: string;
};

export type ValidationRule<TInput> = {
	id: string;
	level: ValidationLevel;
	check: (input: TInput, mode: ValidationMode) => ValidationIssue | ValidationIssue[] | null;
};

export type ValidationResult = {
	ok: boolean;
	errors: ValidationIssue[];
	warnings: ValidationIssue[];
};
