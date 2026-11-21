import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { botProposalIdentity, isIdentityKey, sanitizeIdentityFields } from './identity';
import { assertToolScope, hasScope, PROPOSAL_TOOLS } from './scopes';
import { createStubMcpContext } from './testing';
import { recordRateLimited, runAuditedToolCall } from './tool-gate';

const SAMPLE_MCP_KEY = 'mowa_abcdefgh12_' + 'A'.repeat(43);
const SAMPLE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signaturepart';
const MCP_DIR = dirname(fileURLToPath(import.meta.url));

describe('M-1 secret masking', () => {
	it('matches secret key names by exact/boundary tokens; excludes tokens_count', () => {
		for (const key of [
			'pass',
			'pwd',
			'passwd',
			'password',
			'user_password',
			'secret',
			'private_key',
			'mcp_key',
			'authorization',
			'api_key',
			'apiKey',
			'key_hash',
			'access_token',
			'accessToken',
			'refresh_token',
			'id_token',
			'client_secret',
			'client-secret',
			'token',
			'cookie',
			'set-cookie',
			'bearer',
			'credential',
			'credentials',
			'session_id',
			'session_token',
			'sessionToken',
			'pepper',
			'service_role_key',
			'serviceRoleKey',
			'signature'
		]) {
			expect(isSecretKeyName(key), key).toBe(true);
		}
		expect(isSecretKeyName('session_date')).toBe(false);
		expect(isSecretKeyName('tokens_count')).toBe(false);
		expect(isSecretKeyName('token_count')).toBe(false);
		expect(isSecretKeyName('title')).toBe(false);
	});

	it('preview redacts token/cookie keys as {redacted:true}, not raw text', () => {
		const preview = buildArgsPreview({
			token: 'not-a-jwt-but-still-secret-key',
			cookie: 'session=abc123secret',
			title: 'Bearer market briefing'
		});
		expect(preview.token).toEqual({ redacted: true });
		expect(preview.cookie).toEqual({ redacted: true });
		expect(preview.title).toBe('Bearer market briefing');
		expect(JSON.stringify(preview)).not.toContain('not-a-jwt-but-still-secret-key');
		expect(JSON.stringify(preview)).not.toContain('session=abc123secret');
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

	// Replaces 231c98a it.each value-shape cases under the official M-1 rules
	// (free-text mask; Bearer only with MCP key / JWT — not bare "Bearer abc…").
	it.each([
		['JWT eyJ…', SAMPLE_JWT],
		['Bearer + JWT', `Bearer ${SAMPLE_JWT}`],
		['MCP key prefix', SAMPLE_MCP_KEY]
	] as const)('redacts secret value shape: %s', (_label, value) => {
		expect(looksLikeSecretValue(value)).toBe(true);
		const preview = buildArgsPreview({ note: value });
		const json = JSON.stringify(preview);
		expect(json).not.toContain(SAMPLE_MCP_KEY);
		expect(json).not.toContain(SAMPLE_JWT);
		expect(typeof preview.note).toBe('string');
		expect(String(preview.note)).toContain('[REDACTED]');
	});

	it('does not over-mask Bearer market… titles', () => {
		const preview = buildArgsPreview({ title: 'Bearer market briefing' });
		expect(preview.title).toBe('Bearer market briefing');
	});

	it('preview redacts embedded secrets and body length', () => {
		const body = 'A'.repeat(100);
		const preview = buildArgsPreview({
			title: `my key is ${SAMPLE_MCP_KEY}`,
			body_md: body,
			summary: 'line1\nline2',
			note: 'Bearer market ok'
		});
		expect(JSON.stringify(preview)).not.toContain(SAMPLE_MCP_KEY);
		expect(preview.title).toBe('my key is [REDACTED]');
		expect(preview.note).toBe('Bearer market ok');
		expect(preview.body_md).toEqual({ length: 100 });
		expect(preview.summary).toEqual({ length: 'line1\nline2'.length });
		assertPreviewHasNoRawBody(preview, {
			title: `my key is ${SAMPLE_MCP_KEY}`,
			body_md: body,
			summary: 'line1\nline2',
			note: 'Bearer market ok'
		});
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
	it('maps FORBIDDEN_SCOPE → denied', () => {
		expect(errorCodeToAuditResult('FORBIDDEN_SCOPE')).toBe('denied');
	});
	it('maps RATE_LIMITED → rate_limited', () => {
		expect(errorCodeToAuditResult('RATE_LIMITED')).toBe('rate_limited');
	});
	it('maps everything else → error', () => {
		expect(errorCodeToAuditResult('VALIDATION')).toBe('error');
		expect(errorCodeToAuditResult('INTERNAL')).toBe('error');
		expect(errorCodeToAuditResult('CONFLICT')).toBe('error');
	});
});

describe('M-3 / Low identity strip (R-PERM-03)', () => {
	it('records R-PERM-03 only when sent identity differs from ctx', () => {
		const ctx = createStubMcpContext();
		const mismatch = sanitizeIdentityFields({ owner_id: 'attacker', title: 'x' }, ctx);
		expect(mismatch.identityMismatch).toBe(true);
		expect(mismatch.ruleIds).toEqual(['R-PERM-03']);
		expect(mismatch.args.owner_id).toBeUndefined();
		expect(mismatch.args.title).toBe('x');

		const same = sanitizeIdentityFields({ owner_id: ctx.ownerId, title: 'y' }, ctx);
		expect(same.identityMismatch).toBe(false);
		expect(same.ruleIds).toEqual([]);
		expect(same.args.owner_id).toBeUndefined();
	});

	it('normalizes owner-id / botClientId / created_by; UUID case-insensitive', () => {
		const ctx = createStubMcpContext();
		const same = sanitizeIdentityFields(
			{ 'owner-id': ctx.ownerId.toUpperCase(), title: 't' },
			ctx
		);
		expect(same.identityMismatch).toBe(false);
		expect(same.ruleIds).toEqual([]);
		expect(same.args['owner-id']).toBeUndefined();

		const mismatch = sanitizeIdentityFields(
			{ botClientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_by: 'x' },
			ctx
		);
		expect(mismatch.identityMismatch).toBe(true);
		expect(mismatch.ruleIds).toEqual(['R-PERM-03']);
		expect(mismatch.args.botClientId).toBeUndefined();
		expect(mismatch.args.created_by).toBeUndefined();
	});

	it('strips camelCase nested identity; skips __proto__ whole key', () => {
		const ctx = createStubMcpContext();
		const polluted = JSON.parse(
			'{"ownerId":"spoof","items":[{"owner_id":"nested-spoof","qty":1}],"meta":{"user_id":"u1","proposedByType":"user"}}'
		);
		Object.defineProperty(polluted, '__proto__', {
			value: { owner_id: 'inside-proto' },
			enumerable: true
		});
		const result = sanitizeIdentityFields(polluted, ctx);
		expect(result.identityMismatch).toBe(true);
		expect(result.ruleIds).toEqual(['R-PERM-03']);
		expect(result.args.ownerId).toBeUndefined();
		expect((result.args.items as Array<Record<string, unknown>>)[0]).toEqual({ qty: 1 });
		expect(result.args.meta).toEqual({});
		// Whole-key skip: never copy __proto__ / never inspect nested owner_id inside it
		expect(Object.hasOwn(result.args, '__proto__')).toBe(false);
		expect(JSON.stringify(result.args)).not.toContain('inside-proto');
	});

	it('OWNERID (underscore-free) is not an identity key', () => {
		const ctx = createStubMcpContext();
		expect(isIdentityKey('OWNERID')).toBe(false);
		const result = sanitizeIdentityFields({ OWNERID: 'spoof', title: 't' }, ctx);
		expect(result.identityMismatch).toBe(false);
		expect(result.args.OWNERID).toBe('spoof');
	});

	it('botProposalIdentity matches PR #7 (no proposed_by_bot_id / proposer_type)', () => {
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

describe('M-6 import:all', () => {
	it('unlocks non-proposal writes; forbids proposal + principles tools', () => {
		const importer = { scopes: ['import:all'] };
		expect(assertToolScope(importer, 'add_journal_entry')).toBeNull();
		expect(assertToolScope(importer, 'upsert_report')).toBeNull();
		expect(assertToolScope(importer, 'create_planned_position')).toBeNull();
		expect(assertToolScope(importer, 'whoami')).toBeNull();

		for (const tool of PROPOSAL_TOOLS) {
			expect(assertToolScope(importer, tool)?.structuredContent.code, tool).toBe(
				'FORBIDDEN_SCOPE'
			);
		}
		expect(assertToolScope(importer, 'propose_position_change')?.isError).toBe(true);
		expect(assertToolScope(importer, 'cancel_proposal')?.isError).toBe(true);
		expect(assertToolScope(importer, 'propose_principle_change')?.isError).toBe(true);
		expect(assertToolScope(importer, 'cancel_principle_proposal')?.isError).toBe(true);
		expect(hasScope(importer, 'positions:propose')).toBe(false);
		expect(hasScope(importer, 'principles:propose')).toBe(false);
		// Official: no inventing import_legacy_* — unregistered → FORBIDDEN
		expect(assertToolScope(importer, 'import_legacy_positions')?.isError).toBe(true);
		expect(assertToolScope(importer, 'import_legacy_journal')?.isError).toBe(true);
	});
});

describe('M-4 testing.ts barrel guard', () => {
	it('forbids index.ts re-exports of ./testing', () => {
		const src = readFileSync(join(MCP_DIR, 'index.ts'), 'utf8');
		expect(src).not.toMatch(/from\s+['"]\.\/testing['"]/);
		expect(src).not.toMatch(/export\s+\*\s+from\s+['"]\.\/testing/);
		expect(src).not.toMatch(/createStubMcpContext|createStubAuthProvider/);
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

describe('response + outcomes (L-1/L-2/L-3/L-5/M-5)', () => {
	it('success may include warnings[]; error includes code + errors[]', () => {
		expect(
			mcpSuccess({
				id: 'x',
				warnings: [{ rule: 'R-VAL-M01', message: 'm' }]
			}).structuredContent.warnings?.[0]?.rule
		).toBe('R-VAL-M01');
		const err = validationError([{ rule: 'R-VAL-T05', message: 'm' }]);
		expect(err.isError).toBe(true);
		expect(err.structuredContent.code).toBe('VALIDATION');
		expect(err.structuredContent.errors[0]?.rule).toBe('R-VAL-T05');
	});

	it('records all four results; warnings from data go to audit; row shape matches PR #7', async () => {
		const sink = createMemoryAuditSink();
		const waitUntil = createImmediateWaitUntil();
		const recorder = createAuditRecorder({ sink, waitUntil });
		const ctx = createStubMcpContext({ scopes: ['read', 'journal:write'] });
		const longBody = 'BODY_' + 'Z'.repeat(80);

		const okRes = await runAuditedToolCall({
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
		expect(okRes.isError).toBeFalsy();
		if (!okRes.isError) {
			expect(okRes.structuredContent.warnings?.[0]?.rule).toBe('R-VAL-J06');
		}

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
		expect(ok?.owner_id).toBe(ctx.ownerId);
		expect(ok?.user_id).toBeNull();
		expect(ok?.user_agent).toBe('vitest');
		expect(ok?.warnings[0]?.rule).toBe('R-VAL-J06');
		expect(ok?.rule_ids).toContain('R-VAL-J06');
		expect(ok?.affected_ids).toEqual([{ table: 'journal_entries', id: 'j1' }]);
		expect(JSON.stringify(ok?.args_preview)).not.toContain(longBody);

		const denied = sink.rows.find((r) => r.result === 'denied');
		expect(denied?.error_code).toBe('FORBIDDEN_SCOPE');
		expect(denied?.rule_ids).toEqual(expect.arrayContaining(['R-PERM-04', 'R-PERM-03']));
	});

	it('M-5 unexpected → internalError (message_len log, no secret leak)', async () => {
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
		if (res.isError) {
			expect(res.structuredContent.code).toBe('INTERNAL');
			expect(JSON.stringify(res.structuredContent)).not.toContain('secret=abc');
		}
		expect(String(logError.mock.calls[0]?.[0])).toMatch(/^Error \(message_len=\d+\)$/);
		expect(String(logError.mock.calls[0]?.[0])).not.toContain('secret=abc');
		expect(sink.rows[0]?.result).toBe('error');
		expect(sink.rows[0]?.error_code).toBe('INTERNAL');
	});

	it('L-2 preview validation failure yields {_redacted:true} (row still insertable)', async () => {
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

describe('display id nit (also covered in display-id.spec.ts)', () => {
	it('formats owner-scoped P- / R- ids', () => {
		expect(mowaDisplayId('P', 412)).toBe('P-0412');
		expect(mowaDisplayId('R', 1)).toBe('R-0001');
		expect(mowaDisplayId('P', 10_000)).toBe('P-10000');
		expect(toSnakeLower('botClientId')).toBe('bot_client_id');
	});

	it('rejects P-0000 and leading-zero 5-digit forms; allows P-0412 and P-10000', () => {
		expect(isOwnerScopedDisplayId('P-0412')).toBe(true);
		expect(isOwnerScopedDisplayId('P-10000')).toBe(true);
		expect(isOwnerScopedDisplayId('P-0000')).toBe(false);
		expect(isOwnerScopedDisplayId('P-01234')).toBe(false);
	});
});

describe('mcpError', () => {
	it('builds CONFLICT envelope', () => {
		expect(mcpError('CONFLICT', [{ rule: 'R-VAL-R11', message: 'x' }]).structuredContent.code).toBe(
			'CONFLICT'
		);
	});
});
