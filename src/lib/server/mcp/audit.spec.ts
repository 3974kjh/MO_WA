import { describe, expect, it, vi } from 'vitest';
import {
	assertPreviewHasNoRawBody,
	buildArgsPreview,
	createAuditRecorder,
	createImmediateWaitUntil,
	createMemoryAuditSink,
	digestArgs,
	isSecretKeyName,
	looksLikeSecretValue,
	maskSecretsInString,
	previewOrRedacted,
	toSnakeLower
} from './audit';
import { isOwnerScopedDisplayId, mowaDisplayId } from './display-id';
import {
	errorCodeToAuditResult,
	mcpError,
	mcpSuccess,
	McpToolError,
	validationError
} from './errors';
import { botProposalIdentity, sanitizeIdentityFields } from './identity';
import { assertToolScope, hasScope, PRINCIPLES_WRITE_TOOLS } from './scopes';
import { createStubMcpContext } from './testing';
import { recordRateLimited, runAuditedToolCall } from './tool-gate';

const SAMPLE_MCP_KEY = 'mowa_abcdefgh12_' + 'A'.repeat(43);
const SAMPLE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signaturepart';

describe('M-1 secret masking', () => {
	it('matches secret key names by exact/boundary tokens; excludes tokens_count', () => {
		expect(isSecretKeyName('password')).toBe(true);
		expect(isSecretKeyName('user_password')).toBe(true);
		expect(isSecretKeyName('api_key')).toBe(true);
		expect(isSecretKeyName('accessToken')).toBe(true);
		expect(isSecretKeyName('client-secret')).toBe(true);
		expect(isSecretKeyName('key_hash')).toBe(true);
		expect(isSecretKeyName('mcp_key')).toBe(true);
		expect(isSecretKeyName('authorization')).toBe(true);
		expect(isSecretKeyName('session_date')).toBe(false);
		expect(isSecretKeyName('tokens_count')).toBe(false);
		expect(isSecretKeyName('token_count')).toBe(false);
		expect(isSecretKeyName('title')).toBe(false);
	});

	it('masks MCP key / JWT / Bearer+secret in free text; not "Bearer market…"', () => {
		expect(maskSecretsInString(`my key is ${SAMPLE_MCP_KEY}`)).toBe('my key is [REDACTED]');
		expect(maskSecretsInString(`Authorization: Bearer ${SAMPLE_JWT}`)).toBe(
			'Authorization: Bearer [REDACTED]'
		);
		expect(maskSecretsInString(`jwt ${SAMPLE_JWT}`)).toBe('jwt [REDACTED]');
		expect(maskSecretsInString('Bearer market briefing')).toBe('Bearer market briefing');
		expect(looksLikeSecretValue('Bearer market briefing')).toBe(false);
	});

	it('preview redacts embedded secrets and body length', () => {
		const body = 'A'.repeat(100);
		const preview = buildArgsPreview({
			title: `my key is ${SAMPLE_MCP_KEY}`,
			body_md: body,
			note: 'Bearer market ok'
		});
		expect(JSON.stringify(preview)).not.toContain(SAMPLE_MCP_KEY);
		expect(preview.title).toBe('my key is [REDACTED]');
		expect(preview.note).toBe('Bearer market ok');
		expect(preview.body_md).toEqual({ length: 100 });
	});
});

describe('digestArgs keeps body text (secret-masked only)', () => {
	it('same length different body → different digest', async () => {
		const a = await digestArgs({ body_md: 'AAAAAAAA' });
		const b = await digestArgs({ body_md: 'BBBBBBBB' });
		expect(a).not.toBe(b);
	});

	it('masks secrets in digest input but keeps body content otherwise', async () => {
		const d1 = await digestArgs({ body_md: `hello ${SAMPLE_MCP_KEY}` });
		const d2 = await digestArgs({ body_md: 'hello [REDACTED]' });
		expect(d1).toBe(d2);
		const preview = buildArgsPreview({ body_md: 'hello world body' });
		expect(preview.body_md).toEqual({ length: 'hello world body'.length });
	});
});

describe('M-2 errorCodeToAuditResult', () => {
	it('maps codes', () => {
		expect(errorCodeToAuditResult('FORBIDDEN_SCOPE')).toBe('denied');
		expect(errorCodeToAuditResult('RATE_LIMITED')).toBe('rate_limited');
		expect(errorCodeToAuditResult('VALIDATION')).toBe('error');
	});
});

describe('M-3 / Low identity strip', () => {
	it('normalizes owner-id / botClientId / created_by; UUID case-insensitive', () => {
		const ctx = createStubMcpContext();
		const same = sanitizeIdentityFields(
			{ 'owner-id': ctx.ownerId.toUpperCase(), title: 't' },
			ctx
		);
		expect(same.identityMismatch).toBe(false);
		expect(same.args['owner-id']).toBeUndefined();

		const mismatch = sanitizeIdentityFields(
			{ botClientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_by: 'x' },
			ctx
		);
		expect(mismatch.identityMismatch).toBe(true);
		expect(mismatch.args.botClientId).toBeUndefined();
		expect(mismatch.args.created_by).toBeUndefined();
	});

	it('strips nested identity; skips __proto__', () => {
		const ctx = createStubMcpContext();
		const polluted = JSON.parse('{"items":[{"owner_id":"spoof","qty":1}]}');
		Object.defineProperty(polluted, '__proto__', { value: { polluted: true }, enumerable: true });
		const result = sanitizeIdentityFields(polluted, ctx);
		expect(result.identityMismatch).toBe(true);
		expect((result.args.items as Array<Record<string, unknown>>)[0]).toEqual({ qty: 1 });
		expect(Object.prototype.hasOwnProperty.call(result.args, '__proto__')).toBe(false);
	});

	it('botProposalIdentity matches PR #7', () => {
		const ctx = createStubMcpContext();
		expect(botProposalIdentity(ctx)).toEqual({
			proposed_by: ctx.botClientId,
			proposed_by_type: 'bot',
			proposed_by_user: null
		});
	});
});

describe('M-6 import:all', () => {
	it('unlocks existing write tools but not principles writes', () => {
		const importer = { scopes: ['import:all'] };
		expect(assertToolScope(importer, 'add_journal_entry')).toBeNull();
		expect(assertToolScope(importer, 'propose_position_change')).toBeNull();
		expect(assertToolScope(importer, 'upsert_report')).toBeNull();
		expect(assertToolScope(importer, 'whoami')).toBeNull();
		expect(PRINCIPLES_WRITE_TOOLS.has('propose_principle_change')).toBe(true);
		expect(assertToolScope(importer, 'propose_principle_change')?.structuredContent.code).toBe(
			'FORBIDDEN_SCOPE'
		);
		expect(hasScope(importer, 'principles:propose')).toBe(false);
		expect(assertToolScope(importer, 'import_legacy_positions')?.isError).toBe(true);
	});
});

describe('recordRateLimited strip+mask', () => {
	it('strips owner_id from preview args', async () => {
		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		const ctx = createStubMcpContext();
		recordRateLimited({
			recorder,
			ctx,
			args: { owner_id: 'attacker-owner', body_md: 'x', note: SAMPLE_MCP_KEY }
		});
		await recorder.drain();
		const row = sink.rows[0];
		expect(row?.result).toBe('rate_limited');
		expect(row?.args_preview.owner_id).toBeUndefined();
		expect(JSON.stringify(row?.args_preview)).not.toContain('attacker-owner');
		expect(JSON.stringify(row?.args_preview)).not.toContain(SAMPLE_MCP_KEY);
	});
});

describe('no ctx → onError Workers log', () => {
	it('skips insert and calls onError when ctx missing', async () => {
		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const onError = vi.fn();
		const recorder = createAuditRecorder({ sink, waitUntil, onError });
		recorder.record({
			ctx: null,
			tool: 'whoami',
			args: {},
			result: 'error',
			errorCode: 'INTERNAL'
		});
		await recorder.drain();
		expect(sink.rows).toHaveLength(0);
		expect(onError).toHaveBeenCalled();
	});
});

describe('response + outcomes', () => {
	it('success warnings / FORBIDDEN_SCOPE / four results', async () => {
		expect(
			mcpSuccess({
				id: 'x',
				warnings: [{ rule: 'R-VAL-M01', message: 'm' }]
			}).structuredContent.warnings?.[0]?.rule
		).toBe('R-VAL-M01');
		expect(validationError([{ rule: 'R-VAL-T05', message: 'm' }]).structuredContent.code).toBe(
			'VALIDATION'
		);

		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		const ctx = createStubMcpContext({ scopes: ['read', 'journal:write'] });
		const longBody = 'BODY_' + 'Z'.repeat(80);

		await runAuditedToolCall({
			ctx,
			args: { title: 'entry', body_md: longBody },
			meta: { tool: 'add_journal_entry', userAgent: 'vitest' },
			recorder,
			handler: async () => ({
				data: {
					id: 'j1',
					warnings: [{ rule: 'R-VAL-J06', message: 'dup' }]
				},
				affectedIds: [{ table: 'journal_entries', id: 'j1' }]
			})
		});

		await runAuditedToolCall({
			ctx: createStubMcpContext({ scopes: ['read'] }),
			args: { change_type: 'close', owner_id: 'other' },
			meta: { tool: 'propose_position_change' },
			recorder,
			handler: async () => ({ data: {} })
		});

		await runAuditedToolCall({
			ctx,
			args: {},
			meta: { tool: 'add_journal_entry' },
			recorder,
			handler: async () => {
				throw new McpToolError('VALIDATION', [{ rule: 'R-VAL-J02', message: 'price' }]);
			}
		});

		recordRateLimited({ recorder, ctx, args: { body_md: longBody } });
		await recorder.drain();

		expect(sink.rows.map((r) => r.result).sort()).toEqual(
			['denied', 'error', 'ok', 'rate_limited'].sort()
		);
		const ok = sink.rows.find((r) => r.result === 'ok');
		expect(ok?.warnings[0]?.rule).toBe('R-VAL-J06');
		expect(ok?.user_agent).toBe('vitest');
		expect(ok?.affected_ids).toEqual([{ table: 'journal_entries', id: 'j1' }]);
		expect(JSON.stringify(ok?.args_preview)).not.toContain(longBody);

		const denied = sink.rows.find((r) => r.result === 'denied');
		expect(denied?.rule_ids).toEqual(expect.arrayContaining(['R-PERM-04', 'R-PERM-03']));
	});

	it('M-5 unexpected → internalError', async () => {
		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		const logError = vi.fn();
		const res = await runAuditedToolCall({
			ctx: createStubMcpContext({ scopes: ['read'] }),
			args: {},
			meta: { tool: 'whoami' },
			recorder,
			logError,
			handler: async () => {
				throw new Error('db blew up secret=abc');
			}
		});
		await recorder.drain();
		expect(res.isError).toBe(true);
		if (res.isError) expect(res.structuredContent.code).toBe('INTERNAL');
		expect(String(logError.mock.calls[0]?.[0])).not.toContain('secret=abc');
	});

	it('L-2 previewOrRedacted', () => {
		const body = 'LEAKED_BODY_CONTENT_' + 'Q'.repeat(40);
		expect(() => assertPreviewHasNoRawBody({ body_md: body }, { body_md: body })).toThrow();
		expect(previewOrRedacted({ body_md: body }, { body_md: body })).toEqual({ _redacted: true });
	});

	it('denied/ok share digest for same stripped+masked args', async () => {
		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		const args = { owner_id: 'attacker', note: SAMPLE_MCP_KEY, title: 't' };

		await runAuditedToolCall({
			ctx: createStubMcpContext({ scopes: ['read'] }),
			args,
			meta: { tool: 'propose_position_change' },
			recorder,
			handler: async () => ({ data: {} })
		});
		await runAuditedToolCall({
			ctx: createStubMcpContext({ scopes: ['read'] }),
			args,
			meta: { tool: 'whoami' },
			recorder,
			handler: async () => ({ data: { ok: true } })
		});
		await recorder.drain();
		const denied = sink.rows.find((r) => r.result === 'denied');
		const ok = sink.rows.find((r) => r.result === 'ok');
		expect(denied?.args_digest).toBe(ok?.args_digest);
	});
});

describe('display id', () => {
	it('P-/R- rules', () => {
		expect(mowaDisplayId('P', 412)).toBe('P-0412');
		expect(isOwnerScopedDisplayId('P-0412')).toBe(true);
		expect(isOwnerScopedDisplayId('P-10000')).toBe(true);
		expect(isOwnerScopedDisplayId('P-0000')).toBe(false);
		expect(isOwnerScopedDisplayId('P-01234')).toBe(false);
		expect(toSnakeLower('botClientId')).toBe('bot_client_id');
	});
});

describe('mcpError', () => {
	it('CONFLICT', () => {
		expect(mcpError('CONFLICT', [{ rule: 'R-VAL-R11', message: 'x' }]).structuredContent.code).toBe(
			'CONFLICT'
		);
	});
});
