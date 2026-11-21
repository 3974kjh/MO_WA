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
	normalizeKey,
	previewOrRedacted,
	stableStringify
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
import { assertToolScope, hasScope } from './scopes';
import { createStubMcpContext } from './testing';
import { recordRateLimited, runAuditedToolCall } from './tool-gate';

describe('M-1 secret redaction', () => {
	it('normalizes keys then matches secret patterns', () => {
		expect(normalizeKey('api_key')).toBe('apikey');
		expect(normalizeKey('Access-Token')).toBe('accesstoken');
		for (const key of [
			'token',
			'refresh_token',
			'client_secret',
			'password',
			'passwd',
			'authorization',
			'Cookie',
			'api_key',
			'apiKey',
			'credential',
			'session_id',
			'bearer_token',
			'MCP_KEY_PEPPER'
		]) {
			expect(isSecretKeyName(key), key).toBe(true);
		}
		expect(isSecretKeyName('title')).toBe(false);
	});

	it.each([
		['JWT eyJ…', 'eyJhbGciOiJIUzI1NiJ9.payload.sig'],
		['Bearer prefix', 'Bearer abcdefghijklmnop'],
		['MCP key prefix', 'mowa_abcdefgh12_' + 'A'.repeat(43)]
	] as const)('redacts secret value shape: %s', (_label, value) => {
		expect(looksLikeSecretValue(value)).toBe(true);
		const preview = buildArgsPreview({ note: value });
		expect(JSON.stringify(preview)).not.toContain(value);
		expect(preview.note).toEqual({ redacted: true });
	});

	it('stores body fields as length only — no raw request body', () => {
		const body = 'A'.repeat(500);
		const preview = buildArgsPreview({
			kind: 'daily_brief',
			body_md: body,
			summary: 'line1\nline2',
			title: 'ok-title'
		});
		expect(preview.body_md).toEqual({ length: 500 });
		expect(preview.summary).toEqual({ length: 'line1\nline2'.length });
		expect(preview.title).toBe('ok-title');
		expect(JSON.stringify(preview)).not.toContain(body);
		assertPreviewHasNoRawBody(preview, { body_md: body, summary: 'line1\nline2', title: 'ok-title' });
	});
});

describe('M-2 errorCodeToAuditResult', () => {
	it('maps FORBIDDEN_SCOPE → denied', () => {
		expect(errorCodeToAuditResult('FORBIDDEN_SCOPE')).toBe('denied');
	});
	it('maps RATE_LIMITED → rate_limited', () => {
		expect(errorCodeToAuditResult('RATE_LIMITED')).toBe('rate_limited');
	});
	it('maps everything else → error', () => {
		expect(errorCodeToAuditResult('VALIDATION')).toBe('error');
		expect(errorCodeToAuditResult('CONFLICT')).toBe('error');
		expect(errorCodeToAuditResult('INTERNAL')).toBe('error');
		expect(errorCodeToAuditResult('NOT_FOUND')).toBe('error');
		expect(errorCodeToAuditResult('PAYLOAD_TOO_LARGE')).toBe('error');
	});
});

describe('M-3 identity strip (R-PERM-03)', () => {
	it('records R-PERM-03 only when sent identity differs from ctx', () => {
		const ctx = createStubMcpContext();
		const mismatch = sanitizeIdentityFields(
			{ owner_id: 'attacker', title: 'x' },
			ctx
		);
		expect(mismatch.identityMismatch).toBe(true);
		expect(mismatch.ruleIds).toEqual(['R-PERM-03']);
		expect(mismatch.args.owner_id).toBeUndefined();
		expect(mismatch.args.title).toBe('x');

		const same = sanitizeIdentityFields({ owner_id: ctx.ownerId, title: 'y' }, ctx);
		expect(same.identityMismatch).toBe(false);
		expect(same.ruleIds).toEqual([]);
		expect(same.args.owner_id).toBeUndefined();
	});

	it('strips camelCase and nested identity fields', () => {
		const ctx = createStubMcpContext();
		const result = sanitizeIdentityFields(
			{
				ownerId: 'spoof',
				items: [{ owner_id: 'nested-spoof', qty: 1 }],
				meta: { user_id: 'u1', proposedByType: 'user' }
			},
			ctx
		);
		expect(result.identityMismatch).toBe(true);
		expect(result.args.ownerId).toBeUndefined();
		expect((result.args.items as Array<Record<string, unknown>>)[0]).toEqual({ qty: 1 });
		expect(result.args.meta).toEqual({});
	});

	it('botProposalIdentity matches PR #7 schema (no proposed_by_bot_id / proposer_type)', () => {
		const ctx = createStubMcpContext();
		const stamp = botProposalIdentity(ctx);
		expect(stamp).toEqual({
			proposed_by: ctx.botClientId,
			proposed_by_type: 'bot',
			proposed_by_user: null
		});
		expect('proposed_by_bot_id' in stamp).toBe(false);
		expect('proposer_type' in stamp).toBe(false);
	});
});

describe('M-6 import:all is not a wildcard', () => {
	it('does not grant principles:propose via import:all', () => {
		expect(hasScope({ scopes: ['import:all'] }, 'principles:propose')).toBe(false);
		const denied = assertToolScope({ scopes: ['import:all'] }, 'propose_principle_change');
		expect(denied?.structuredContent.code).toBe('FORBIDDEN_SCOPE');
	});

	it('allows import:all only on importer migration tools', () => {
		expect(assertToolScope({ scopes: ['import:all'] }, 'import_legacy_positions')).toBeNull();
		expect(assertToolScope({ scopes: ['read'] }, 'import_legacy_positions')?.isError).toBe(true);
	});
});

describe('response contract (design §5-3)', () => {
	it('success may include warnings[]', () => {
		const res = mcpSuccess({
			id: 'x',
			warnings: [{ rule: 'R-VAL-M01', field: 'currency', message: 'market default USD' }]
		});
		expect(res.isError).toBeFalsy();
		expect(res.structuredContent.warnings?.[0]?.rule).toBe('R-VAL-M01');
	});

	it('error includes code + errors[]', () => {
		const res = validationError([
			{ rule: 'R-VAL-T05', field: 'period_start', message: 'weekly period invalid' }
		]);
		expect(res.isError).toBe(true);
		expect(res.structuredContent.code).toBe('VALIDATION');
	});
});

describe('display id nit', () => {
	it('formats owner-scoped P- / R- ids', () => {
		expect(mowaDisplayId('P', 412)).toBe('P-0412');
		expect(mowaDisplayId('R', 1)).toBe('R-0001');
		expect(mowaDisplayId('P', 10_000)).toBe('P-10000');
	});

	it('rejects P-0000 and leading-zero 5-digit forms; allows P-0412 and P-10000', () => {
		expect(isOwnerScopedDisplayId('P-0412')).toBe(true);
		expect(isOwnerScopedDisplayId('P-10000')).toBe(true);
		expect(isOwnerScopedDisplayId('P-0000')).toBe(false);
		expect(isOwnerScopedDisplayId('P-01234')).toBe(false);
		expect(isOwnerScopedDisplayId('PP-0412')).toBe(false);
	});
});

describe('L-4 digest after strip+redact', () => {
	it('denied and ok paths share the same digest for the same stripped args', async () => {
		const ctx = createStubMcpContext({ scopes: ['read'] });
		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		const secret = 'mowa_abcdefgh12_' + 'B'.repeat(43);

		await runAuditedToolCall({
			ctx,
			args: { owner_id: 'attacker', note: secret, title: 't' },
			meta: { tool: 'propose_position_change', requestId: 'd1' },
			recorder,
			handler: async () => ({ data: {} })
		});

		await runAuditedToolCall({
			ctx: createStubMcpContext({ scopes: ['read'] }),
			args: { owner_id: 'attacker', note: secret, title: 't' },
			meta: { tool: 'whoami', requestId: 'o1' },
			recorder,
			handler: async () => ({ data: { ok: true } })
		});

		await recorder.drain();
		const denied = sink.rows.find((r) => r.result === 'denied');
		const ok = sink.rows.find((r) => r.result === 'ok');
		expect(denied?.args_digest).toBe(ok?.args_digest);
		expect(JSON.stringify(denied?.args_preview)).not.toContain(secret);
		expect(JSON.stringify(ok?.args_preview)).not.toContain(secret);
	});

	it('digestArgs hashes redacted form (not raw secrets)', async () => {
		const raw = await digestArgs({ token: 'super-secret-value-xyz' });
		const again = await digestArgs({ token: 'super-secret-value-xyz' });
		expect(raw).toBe(again);
		expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
	});
});

describe('audit outcomes + L-1/L-2/L-3/L-5/M-5', () => {
	it('records all four results; warnings from data go to audit; row shape matches PR #7', async () => {
		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		const ctx = createStubMcpContext({ scopes: ['read', 'journal:write'] });
		const longBody = 'BODY_SECRET_CONTENT_' + 'Z'.repeat(80);

		const okRes = await runAuditedToolCall({
			ctx,
			args: { title: 'entry', body_md: longBody },
			meta: { tool: 'add_journal_entry', requestId: '1', userAgent: 'vitest' },
			recorder,
			handler: async () => ({
				data: {
					id: 'j1',
					created: true,
					warnings: [{ rule: 'R-VAL-J06', message: 'duplicate day/title without client_ref' }]
				},
				affectedIds: [{ table: 'journal_entries', id: 'j1' }]
			})
		});
		expect(okRes.isError).toBeFalsy();
		if (!okRes.isError) {
			expect(okRes.structuredContent.warnings?.[0]?.rule).toBe('R-VAL-J06');
		}

		const deniedRes = await runAuditedToolCall({
			ctx: createStubMcpContext({ scopes: ['read'] }),
			args: { change_type: 'close', owner_id: 'other-owner' },
			meta: { tool: 'propose_position_change', requestId: '2' },
			recorder,
			handler: async () => ({ data: {} })
		});
		expect(deniedRes.isError).toBe(true);

		await runAuditedToolCall({
			ctx,
			args: { body_md: longBody },
			meta: { tool: 'add_journal_entry', requestId: '3' },
			recorder,
			handler: async () => {
				throw new McpToolError('VALIDATION', [
					{ rule: 'R-VAL-J02', field: 'price', message: 'buy requires price' }
				]);
			}
		});

		recordRateLimited({
			recorder,
			ctx,
			tool: '(auth)',
			requestId: '4',
			args: { body_md: longBody }
		});

		await recorder.drain();

		expect(sink.rows.map((r) => r.result).sort()).toEqual(
			['denied', 'error', 'ok', 'rate_limited'].sort()
		);

		const okRow = sink.rows.find((r) => r.result === 'ok');
		expect(okRow?.owner_id).toBe(ctx.ownerId);
		expect(okRow?.user_agent).toBe('vitest');
		expect(okRow?.user_id).toBeNull();
		expect(okRow?.warnings[0]?.rule).toBe('R-VAL-J06');
		expect(okRow?.rule_ids).toContain('R-VAL-J06');
		expect(okRow?.affected_ids).toEqual([{ table: 'journal_entries', id: 'j1' }]);
		expect(JSON.stringify(okRow?.args_preview)).not.toContain(longBody);

		const deniedRow = sink.rows.find((r) => r.result === 'denied');
		expect(deniedRow?.error_code).toBe('FORBIDDEN_SCOPE');
		expect(deniedRow?.rule_ids).toContain('R-PERM-04');
		expect(deniedRow?.rule_ids).toContain('R-PERM-03'); // L-5
	});

	it('M-5: unexpected exceptions become internalError envelopes (not rethrown)', async () => {
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
				throw new Error('db connection blew up with secret=abc');
			}
		});
		await recorder.drain();
		expect(res.isError).toBe(true);
		if (res.isError) {
			expect(res.structuredContent.code).toBe('INTERNAL');
			expect(JSON.stringify(res.structuredContent)).not.toContain('secret=abc');
		}
		expect(logError).toHaveBeenCalled();
		expect(String(logError.mock.calls[0]?.[0])).toMatch(/^Error \(message_len=\d+\)$/);
		expect(String(logError.mock.calls[0]?.[0])).not.toContain('secret=abc');
		expect(sink.rows[0]?.result).toBe('error');
		expect(sink.rows[0]?.error_code).toBe('INTERNAL');
	});

	it('L-2: preview validation failure yields {_redacted:true} (row still insertable)', async () => {
		const body = 'LEAKED_BODY_CONTENT_' + 'Q'.repeat(40);
		expect(() => assertPreviewHasNoRawBody({ body_md: body }, { body_md: body })).toThrow();
		expect(previewOrRedacted({ body_md: body }, { body_md: body })).toEqual({ _redacted: true });

		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		recorder.record({
			ctx: createStubMcpContext(),
			tool: 'whoami',
			args: { body_md: body },
			result: 'ok'
		});
		await recorder.drain();
		expect(sink.rows).toHaveLength(1);
		expect(JSON.stringify(sink.rows[0]?.args_preview)).not.toContain(body);
	});

	it('same owner_id as ctx does not log R-PERM-03', async () => {
		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		const ctx = createStubMcpContext({ scopes: ['read'] });
		await runAuditedToolCall({
			ctx,
			args: { owner_id: ctx.ownerId },
			meta: { tool: 'whoami' },
			recorder,
			handler: async ({ args }) => {
				expect(args.owner_id).toBeUndefined();
				return { data: { ok: true } };
			}
		});
		await recorder.drain();
		expect(sink.rows[0]?.rule_ids).not.toContain('R-PERM-03');
	});
});

describe('mcpError helpers', () => {
	it('builds CONFLICT envelope', () => {
		const res = mcpError('CONFLICT', [{ rule: 'R-VAL-R11', message: 'key owned by another actor' }]);
		expect(res.structuredContent.code).toBe('CONFLICT');
	});
});
