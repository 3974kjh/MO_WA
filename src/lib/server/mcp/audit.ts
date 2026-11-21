import { sha256Hex } from './crypto';
import type {
	AuditSink,
	McpActorType,
	McpAuditLogRow,
	McpAuditResult,
	McpContext,
	McpErrorCode,
	McpRuleIssue,
	WaitUntilFn
} from './types';

/** Fields that must never appear as raw values in args_preview (secrets / large bodies). */
const REDACT_SECRET_KEYS = new Set([
	'authorization',
	'password',
	'secret',
	'token',
	'api_key',
	'apikey',
	'key_hash',
	'pepper',
	'mcp_key_pepper',
	'access_token',
	'refresh_token',
	'service_role_key'
]);

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

const PREVIEW_MAX_BYTES = 2048;

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

/**
 * Stable JSON for digests: sort object keys recursively.
 * Arrays keep order; values are not redacted here (digest covers full sanitized args).
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

function redactValue(key: string, value: unknown): unknown {
	const lower = key.toLowerCase();
	if (REDACT_SECRET_KEYS.has(lower) || lower.endsWith('_secret') || lower.endsWith('_pepper')) {
		return { redacted: true };
	}
	if (BODY_LENGTH_ONLY_KEYS.has(lower) || lower.endsWith('_md') || lower.endsWith('_body')) {
		if (typeof value === 'string') return { length: value.length };
		if (value == null) return { length: 0 };
		return { length: utf8Bytes(stableStringify(value)) };
	}
	if (Array.isArray(value)) {
		return value.map((item, i) => redactValue(String(i), item));
	}
	if (isPlainObject(value)) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k] = redactValue(k, v);
		return out;
	}
	return value;
}

/**
 * Build args_preview for mcp_audit_log.
 * - Never includes raw request body / long markdown — length only.
 * - Never includes secret values.
 * - Truncated to 2KB.
 */
export function buildArgsPreview(
	args: unknown,
	options: BuildArgsPreviewOptions = {}
): Record<string, unknown> {
	const maxBytes = options.maxBytes ?? PREVIEW_MAX_BYTES;
	const root = args == null ? {} : isPlainObject(args) ? args : { value: args };
	const redacted = redactValue('root', root) as Record<string, unknown>;

	let json = JSON.stringify(redacted);
	if (utf8Bytes(json) <= maxBytes) return redacted as Record<string, unknown>;

	// Truncate: keep key set with a marker rather than raw body slice.
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

export async function digestArgs(args: unknown): Promise<string> {
	return sha256Hex(stableStringify(args ?? {}));
}

export type RecordAuditInput = {
	actorType?: McpActorType;
	ctx?: Pick<McpContext, 'botClientId' | 'ownerId'> | null;
	tool: string;
	requestId?: string | null;
	args?: unknown;
	result: McpAuditResult;
	errorCode?: McpErrorCode | null;
	ruleIds?: string[];
	warnings?: McpRuleIssue[];
	affectedIds?: string[];
	durationMs?: number | null;
	ip?: string | null;
};

export type AuditRecorder = {
	record(input: RecordAuditInput): void;
	/** Flush pending waitUntil tasks (tests). */
	drain(): Promise<void>;
};

export type CreateAuditRecorderOptions = {
	sink: AuditSink;
	waitUntil: WaitUntilFn;
	/** Optional logger for sink failures (never log secrets / raw bodies). */
	onError?: (err: unknown) => void;
};

/**
 * Create an audit recorder that writes via waitUntil (design §5-6).
 * Auth failures without bot identity should not call this — Workers logs only.
 */
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

	const row: McpAuditLogRow = {
		actor_type: input.actorType ?? (input.ctx ? 'bot' : 'system'),
		bot_client_id: input.ctx?.botClientId ?? null,
		owner_id: input.ctx?.ownerId ?? null,
		tool: input.tool,
		request_id: input.requestId ?? null,
		args_digest: await digestArgs(input.args),
		args_preview: buildArgsPreview(input.args),
		result: input.result,
		error_code: input.errorCode ?? null,
		rule_ids: ruleIds,
		warnings,
		affected_ids: input.affectedIds ?? [],
		duration_ms: input.durationMs ?? null,
		ip: input.ip ?? null
	};

	assertPreviewHasNoRawBody(row.args_preview, input.args);
	await sink.insert(row);
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}

/**
 * Guard: if the original args contained a long body string, preview must not embed it.
 * Used in tests and as a runtime sanity check (throws only when a raw body substring leaks).
 */
export function assertPreviewHasNoRawBody(
	preview: Record<string, unknown>,
	originalArgs: unknown
): void {
	if (!isPlainObject(originalArgs)) return;
	const serialized = JSON.stringify(preview);
	for (const [key, value] of Object.entries(originalArgs)) {
		const lower = key.toLowerCase();
		if (
			typeof value === 'string' &&
			value.length >= 24 &&
			(BODY_LENGTH_ONLY_KEYS.has(lower) || lower.endsWith('_md') || lower.endsWith('_body'))
		) {
			if (serialized.includes(value)) {
				throw new Error('args_preview must not contain raw body content');
			}
		}
		if (
			typeof value === 'string' &&
			value.length >= 8 &&
			(REDACT_SECRET_KEYS.has(lower) || lower.endsWith('_secret') || lower.endsWith('_pepper'))
		) {
			if (serialized.includes(value)) {
				throw new Error('args_preview must not contain secret values');
			}
		}
	}
}

/** In-memory sink for tests. */
export function createMemoryAuditSink(): AuditSink & { rows: McpAuditLogRow[] } {
	const rows: McpAuditLogRow[] = [];
	return {
		rows,
		async insert(row) {
			rows.push(row);
		}
	};
}

/** Sync waitUntil that still runs async work (awaits via drain). */
export function createImmediateWaitUntil(): WaitUntilFn & { promises: Promise<unknown>[] } {
	const promises: Promise<unknown>[] = [];
	const fn = ((p: Promise<unknown>) => {
		promises.push(p);
	}) as WaitUntilFn & { promises: Promise<unknown>[] };
	fn.promises = promises;
	return fn;
}

/** Map platform.ctx.waitUntil when present; otherwise track for fire-and-forget. */
export function platformWaitUntil(platform: { ctx?: { waitUntil?: WaitUntilFn } } | undefined): WaitUntilFn {
	if (platform?.ctx?.waitUntil) {
		return (p) => platform.ctx!.waitUntil!(p);
	}
	return (p) => {
		void p.catch(() => {
			/* swallow — request already completed */
		});
	};
}
