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

/** Long-text / body fields: preview stores length only (design §5-6). */
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
 * Normalized key substrings that mark secrets (M-1).
 * Key is lowercased with `_` / `-` removed before matching.
 */
const SECRET_KEY_PATTERNS = [
	'token',
	'secret',
	'passw',
	'authorization',
	'cookie',
	'apikey',
	'credential',
	'session',
	'bearer',
	'pepper',
	'keyhash'
] as const;

const PREVIEW_MAX_BYTES = 2048;
const MCP_KEY_PREFIX = 'mowa_';

export type BuildArgsPreviewOptions = {
	/** Max UTF-8 byte size of serialized preview (default 2KB). */
	maxBytes?: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function utf8Bytes(s: string): number {
	return new TextEncoder().encode(s).length;
}

/** Lowercase + strip `_` / `-` for pattern matching (M-1). */
export function normalizeKey(key: string): string {
	return key.toLowerCase().replace(/[_-]/g, '');
}

export function isSecretKeyName(key: string): boolean {
	const norm = normalizeKey(key);
	return SECRET_KEY_PATTERNS.some((p) => norm.includes(p));
}

/** Value-shape secret detectors (M-1). */
export function looksLikeSecretValue(value: unknown): boolean {
	if (typeof value !== 'string' || value.length < 8) return false;
	const trimmed = value.trim();
	if (trimmed.startsWith('eyJ')) return true; // JWT
	if (/^Bearer\s+\S+/i.test(trimmed)) return true;
	if (trimmed.startsWith(MCP_KEY_PREFIX)) return true;
	return false;
}

/**
 * Stable JSON for digests: sort object keys recursively.
 */
export function stableStringify(value: unknown): string {
	if (value === undefined) return 'null';
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((v) => stableStringify(v)).join(',')}]`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Deep-redact for preview + digest (L-4: one pipeline after identity strip).
 */
export function redactArgs(value: unknown, key = 'root'): unknown {
	if (isSecretKeyName(key) || looksLikeSecretValue(value)) {
		return { redacted: true };
	}
	const lower = key.toLowerCase();
	if (BODY_LENGTH_ONLY_KEYS.has(lower) || lower.endsWith('_md') || lower.endsWith('_body')) {
		if (typeof value === 'string') return { length: value.length };
		if (value == null) return { length: 0 };
		return { length: utf8Bytes(stableStringify(value)) };
	}
	if (Array.isArray(value)) {
		return value.map((item, i) => redactArgs(item, String(i)));
	}
	if (isPlainObject(value)) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k] = redactArgs(v, k);
		return out;
	}
	return value;
}

/**
 * Build args_preview for mcp_audit_log.
 * - Never includes raw request body / long markdown — length only.
 * - Never includes secret values (key patterns + value shapes).
 * - Truncated to 2KB.
 */
export function buildArgsPreview(
	args: unknown,
	options: BuildArgsPreviewOptions = {}
): Record<string, unknown> {
	const maxBytes = options.maxBytes ?? PREVIEW_MAX_BYTES;
	const root = args == null ? {} : isPlainObject(args) ? args : { value: args };
	const redacted = redactArgs(root) as Record<string, unknown>;

	let json = JSON.stringify(redacted);
	if (utf8Bytes(json) <= maxBytes) return redacted;

	const truncated: Record<string, unknown> = {
		_truncated: true,
		_bytes: utf8Bytes(json),
		_keys: Object.keys(redacted).sort()
	};
	json = JSON.stringify(truncated);
	if (utf8Bytes(json) > maxBytes) {
		return { _truncated: true, _bytes: utf8Bytes(JSON.stringify(redacted)) };
	}
	return truncated;
}

/**
 * Digest = sha256(sorted JSON after redact) (L-4).
 * Callers must pass identity-stripped args so denied/ok share the same pipeline.
 */
export async function digestArgs(args: unknown): Promise<string> {
	const redacted = redactArgs(args == null ? {} : args);
	return sha256Hex(stableStringify(redacted));
}

export type RecordAuditInput = {
	actorType?: McpActorType;
	/** Required for tool-call audits — owner_id NOT NULL in mcp_audit_log. */
	ctx: Pick<McpContext, 'botClientId' | 'ownerId'>;
	userId?: string | null;
	tool: string;
	requestId?: string | null;
	/** Prefer identity-stripped args (same input for digest + preview). */
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
			schedule(writeAuditRow(options.sink, input));
		},
		async drain() {
			await Promise.all([...pending]);
		}
	};
}

async function writeAuditRow(sink: AuditSink, input: RecordAuditInput): Promise<void> {
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
		bot_client_id: input.ctx.botClientId,
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

/**
 * L-2: if preview validation fails, keep the audit row with a redacted marker
 * instead of dropping the insert.
 */
export function previewOrRedacted(
	preview: Record<string, unknown>,
	originalArgs: unknown
): Record<string, unknown> {
	try {
		assertPreviewHasNoRawBody(preview, originalArgs);
		return preview;
	} catch {
		return { _redacted: true };
	}
}

export function safeArgsPreview(args: unknown): Record<string, unknown> {
	return previewOrRedacted(buildArgsPreview(args), args);
}

/**
 * Guard: preview must not embed long bodies or secret values from original args.
 */
export function assertPreviewHasNoRawBody(
	preview: Record<string, unknown>,
	originalArgs: unknown
): void {
	const serialized = JSON.stringify(preview);
	const scan = (value: unknown, key: string) => {
		if (typeof value === 'string') {
			if (
				value.length >= 24 &&
				(BODY_LENGTH_ONLY_KEYS.has(key.toLowerCase()) ||
					key.toLowerCase().endsWith('_md') ||
					key.toLowerCase().endsWith('_body')) &&
				serialized.includes(value)
			) {
				throw new Error('args_preview must not contain raw body content');
			}
			if (
				(isSecretKeyName(key) || looksLikeSecretValue(value)) &&
				value.length >= 8 &&
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
