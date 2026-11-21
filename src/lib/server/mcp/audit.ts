import { sha256Hex } from './crypto';
import type {
	AuditSink,
	McpActorType,
	McpAffectedId,
	McpAuditLogRow,
	McpAuditResult,
	McpContext,
	McpErrorCode,
	McpRuleIssue,
	WaitUntilFn
} from './types';

/** Prototype-pollution keys — never copy or recurse into these. */
export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Preview only: long-text / body fields store length (design §5-6). Digest keeps original text. */
const BODY_LENGTH_ONLY_KEYS = new Set([
	'body',
	'body_md',
	'summary',
	'memo_md',
	'reason_md',
	'proposed_body_md',
	'content',
	'raw',
	'raw_body',
	'request_body',
	'payload'
]);

/**
 * Secret key tokens (after snake_lower normalization).
 * Match exact key or separator-bounded segment — not substring
 * (exclusions: session_date, tokens_count, token_count).
 */
const SECRET_KEY_TOKENS = [
	'pass',
	'pwd',
	'passwd',
	'password',
	'secret',
	'private_key',
	'mcp_key',
	'authorization',
	'api_key',
	'key_hash',
	'access_token',
	'refresh_token',
	'id_token',
	'client_secret',
	'token',
	'cookie',
	'bearer',
	'credential',
	'credentials',
	'session_id',
	'session_token',
	'pepper',
	'service_role_key',
	'signature'
] as const;

/** Explicit non-secret keys that must not be treated as secret names. */
const SECRET_KEY_EXCLUSIONS = new Set(['session_date', 'tokens_count', 'token_count']);

const PREVIEW_MAX_BYTES = 2048;

/** MCP API key in free text. */
export const MCP_KEY_VALUE_RE = /mowa_[a-z0-9]{10}_\S+/g;
/** JWT in free text. */
export const JWT_VALUE_RE = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
/**
 * Bearer only when followed by MCP key or JWT — not "Bearer market…".
 */
export const BEARER_SECRET_RE =
	/Bearer\s+(?:mowa_[a-z0-9]{10}_\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+)/gi;

export type BuildArgsPreviewOptions = {
	maxBytes?: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function utf8Bytes(s: string): number {
	return new TextEncoder().encode(s).length;
}

function emptyObject(): Record<string, unknown> {
	return Object.create(null) as Record<string, unknown>;
}

/** camelCase / kebab → snake_lower for identity & secret key matching. */
export function toSnakeLower(key: string): string {
	return key
		.replace(/-/g, '_')
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.toLowerCase();
}

/** @deprecated use toSnakeLower — kept for tests that called normalizeKey. */
export function normalizeKey(key: string): string {
	return toSnakeLower(key).replace(/_/g, '');
}

export function isSecretKeyName(key: string): boolean {
	const snake = toSnakeLower(key);
	if (SECRET_KEY_EXCLUSIONS.has(snake)) return false;

	const segments = snake.split('_').filter(Boolean);
	for (const token of SECRET_KEY_TOKENS) {
		const tokenSegs = token.split('_');
		if (snake === token) return true;
		// Separator-bounded consecutive segment match (e.g. user_password → password)
		for (let i = 0; i <= segments.length - tokenSegs.length; i++) {
			if (tokenSegs.every((t, j) => segments[i + j] === t)) return true;
		}
	}
	return false;
}

/** Mask MCP keys / JWTs / Bearer+secret wherever they appear in a string. */
export function maskSecretsInString(value: string): string {
	return value
		.replace(BEARER_SECRET_RE, 'Bearer [REDACTED]')
		.replace(MCP_KEY_VALUE_RE, '[REDACTED]')
		.replace(JWT_VALUE_RE, '[REDACTED]');
}

export function looksLikeSecretValue(value: unknown): boolean {
	if (typeof value !== 'string' || value.length < 8) return false;
	MCP_KEY_VALUE_RE.lastIndex = 0;
	JWT_VALUE_RE.lastIndex = 0;
	BEARER_SECRET_RE.lastIndex = 0;
	return (
		MCP_KEY_VALUE_RE.test(value) || JWT_VALUE_RE.test(value) || BEARER_SECRET_RE.test(value)
	);
}

export function stableStringify(value: unknown): string {
	if (value === undefined) return 'null';
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((v) => stableStringify(v)).join(',')}]`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj)
		.filter((k) => !DANGEROUS_KEYS.has(k))
		.sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Identity-stripped args → secret-masked tree for digests.
 * Keeps body_md / summary text (after in-string secret masking). Does not use {length}.
 */
export function maskSecretsForDigest(value: unknown, key = 'root'): unknown {
	if (DANGEROUS_KEYS.has(key)) return undefined;
	if (isSecretKeyName(key)) return { redacted: true };
	if (typeof value === 'string') return maskSecretsInString(value);
	if (Array.isArray(value)) {
		return value.map((item, i) => maskSecretsForDigest(item, String(i)));
	}
	if (isPlainObject(value)) {
		const out = emptyObject();
		for (const [k, v] of Object.entries(value)) {
			if (DANGEROUS_KEYS.has(k)) continue;
			out[k] = maskSecretsForDigest(v, k);
		}
		return out;
	}
	return value;
}

/**
 * Preview tree: secret-mask first, then body fields → {length} (design §5-6).
 */
export function redactArgsForPreview(value: unknown, key = 'root'): unknown {
	if (DANGEROUS_KEYS.has(key)) return undefined;
	if (isSecretKeyName(key)) return { redacted: true };

	const lower = toSnakeLower(key);
	if (BODY_LENGTH_ONLY_KEYS.has(lower) || lower.endsWith('_md') || lower.endsWith('_body')) {
		if (typeof value === 'string') {
			const masked = maskSecretsInString(value);
			return { length: masked.length };
		}
		if (value == null) return { length: 0 };
		return { length: utf8Bytes(stableStringify(maskSecretsForDigest(value, key))) };
	}

	if (typeof value === 'string') return maskSecretsInString(value);
	if (Array.isArray(value)) {
		return value.map((item, i) => redactArgsForPreview(item, String(i)));
	}
	if (isPlainObject(value)) {
		const out = emptyObject();
		for (const [k, v] of Object.entries(value)) {
			if (DANGEROUS_KEYS.has(k)) continue;
			out[k] = redactArgsForPreview(v, k);
		}
		return out;
	}
	return value;
}

/** @deprecated alias — prefer redactArgsForPreview */
export const redactArgs = redactArgsForPreview;

export function buildArgsPreview(
	args: unknown,
	options: BuildArgsPreviewOptions = {}
): Record<string, unknown> {
	const maxBytes = options.maxBytes ?? PREVIEW_MAX_BYTES;
	const root = args == null ? {} : isPlainObject(args) ? args : { value: args };
	const redacted = redactArgsForPreview(root) as Record<string, unknown>;

	let json = JSON.stringify(redacted);
	if (utf8Bytes(json) <= maxBytes) return redacted;

	const truncated = emptyObject();
	truncated._truncated = true;
	truncated._bytes = utf8Bytes(json);
	truncated._keys = Object.keys(redacted).sort();
	json = JSON.stringify(truncated);
	if (utf8Bytes(json) > maxBytes) {
		const tiny = emptyObject();
		tiny._truncated = true;
		tiny._bytes = utf8Bytes(JSON.stringify(redacted));
		return tiny;
	}
	return truncated;
}

/**
 * Digest = sha256(sorted JSON after secret-mask). Body text kept (not {length}).
 * Callers must pass identity-stripped args.
 */
export async function digestArgs(args: unknown): Promise<string> {
	const masked = maskSecretsForDigest(args == null ? {} : args);
	return sha256Hex(stableStringify(masked));
}

export type RecordAuditInput = {
	actorType?: McpActorType;
	/** When missing, row is not inserted — onError / Workers log only. */
	ctx?: Pick<McpContext, 'botClientId' | 'ownerId'> | null;
	userId?: string | null;
	tool: string;
	requestId?: string | null;
	args?: unknown;
	result: McpAuditResult;
	errorCode?: McpErrorCode | null;
	ruleIds?: string[];
	warnings?: McpRuleIssue[];
	affectedIds?: McpAffectedId[];
	durationMs?: number | null;
	ip?: string | null;
	userAgent?: string | null;
};

export type AuditRecorder = {
	record(input: RecordAuditInput): void;
	drain(): Promise<void>;
};

export type CreateAuditRecorderOptions = {
	sink: AuditSink;
	waitUntil: WaitUntilFn;
	onError?: (err: unknown) => void;
};

export function createAuditRecorder(options: CreateAuditRecorderOptions): AuditRecorder {
	const pending = new Set<Promise<unknown>>();

	const schedule = (work: Promise<unknown>) => {
		const tracked = work.catch((err) => {
			options.onError?.(err);
		});
		pending.add(tracked);
		tracked.finally(() => pending.delete(tracked));
		options.waitUntil(tracked);
	};

	return {
		record(input: RecordAuditInput) {
			schedule(writeAuditRow(options.sink, input, options.onError));
		},
		async drain() {
			await Promise.all([...pending]);
		}
	};
}

async function writeAuditRow(
	sink: AuditSink,
	input: RecordAuditInput,
	onError?: (err: unknown) => void
): Promise<void> {
	if (!input.ctx?.ownerId) {
		// No authenticated owner — Workers log only (design §5-6 auth-fail path).
		onError?.(
			new Error(
				`mcp_audit_skip: no ctx for tool=${input.tool} result=${input.result}`
			)
		);
		return;
	}

	const warnings = input.warnings ?? [];
	const ruleIds = uniqueStrings([
		...(input.ruleIds ?? []),
		...warnings.map((w) => w.rule).filter(Boolean)
	]);

	const args = input.args ?? {};
	const argsPreview = safeArgsPreview(args);

	const row: McpAuditLogRow = {
		owner_id: input.ctx.ownerId,
		actor_type: input.actorType ?? 'bot',
		bot_client_id: input.ctx.botClientId ?? null,
		user_id: input.userId ?? null,
		tool: input.tool,
		request_id: input.requestId ?? null,
		args_digest: await digestArgs(args),
		args_preview: argsPreview,
		result: input.result,
		error_code: input.errorCode ?? null,
		rule_ids: ruleIds,
		warnings,
		affected_ids: input.affectedIds ?? [],
		duration_ms: input.durationMs ?? null,
		ip: input.ip ?? null,
		user_agent: input.userAgent ?? null
	};

	await sink.insert(row);
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}

export function previewOrRedacted(
	preview: Record<string, unknown>,
	originalArgs: unknown
): Record<string, unknown> {
	try {
		assertPreviewHasNoRawBody(preview, originalArgs);
		return preview;
	} catch {
		const marker = emptyObject();
		marker._redacted = true;
		return marker;
	}
}

export function safeArgsPreview(args: unknown): Record<string, unknown> {
	return previewOrRedacted(buildArgsPreview(args), args);
}

/**
 * Guard: preview must not embed raw bodies or unmasked secrets.
 * Body fields are expected as {length} in preview.
 */
export function assertPreviewHasNoRawBody(
	preview: Record<string, unknown>,
	originalArgs: unknown
): void {
	const serialized = JSON.stringify(preview);
	const scan = (value: unknown, key: string) => {
		if (DANGEROUS_KEYS.has(key)) return;
		if (typeof value === 'string') {
			const lower = toSnakeLower(key);
			if (
				value.length >= 24 &&
				(BODY_LENGTH_ONLY_KEYS.has(lower) ||
					lower.endsWith('_md') ||
					lower.endsWith('_body')) &&
				serialized.includes(value)
			) {
				throw new Error('args_preview must not contain raw body content');
			}
			if (isSecretKeyName(key) && value.length >= 8 && serialized.includes(value)) {
				throw new Error('args_preview must not contain secret values');
			}
			MCP_KEY_VALUE_RE.lastIndex = 0;
			JWT_VALUE_RE.lastIndex = 0;
			if (
				(MCP_KEY_VALUE_RE.test(value) || JWT_VALUE_RE.test(value)) &&
				serialized.includes(value)
			) {
				throw new Error('args_preview must not contain secret values');
			}
		} else if (Array.isArray(value)) {
			value.forEach((item, i) => scan(item, String(i)));
		} else if (isPlainObject(value)) {
			for (const [k, v] of Object.entries(value)) scan(v, k);
		}
	};
	scan(originalArgs, 'root');
}

export function createMemoryAuditSink(): AuditSink & { rows: McpAuditLogRow[] } {
	const rows: McpAuditLogRow[] = [];
	return {
		rows,
		async insert(row) {
			rows.push(row);
		}
	};
}

export function createImmediateWaitUntil(): WaitUntilFn & { promises: Promise<unknown>[] } {
	const promises: Promise<unknown>[] = [];
	const fn = ((p: Promise<unknown>) => {
		promises.push(p);
	}) as WaitUntilFn & { promises: Promise<unknown>[] };
	fn.promises = promises;
	return fn;
}

export function platformWaitUntil(
	platform: { ctx?: { waitUntil?: WaitUntilFn } } | undefined
): WaitUntilFn {
	if (platform?.ctx?.waitUntil) {
		return (p) => platform.ctx!.waitUntil!(p);
	}
	return (p) => {
		void p.catch(() => {
			/* swallow */
		});
	};
}
