/**
 * BE-14 — Generate docs/mcp-tools.md from live MCP tool zod schemas.
 * Collects registrations via registerAllMcpTools (same path as production),
 * converts input shapes with zod's z.toJSONSchema, and assembles the operator guide
 * from auth / route / errors / scopes contracts already in code.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
	ALL_MCP_TOOL_NAMES,
	EVENT_WRITE_SENTINEL,
	PROPOSAL_TOOLS,
	REPORT_KIND_TO_SCOPE,
	REPORT_WRITE_SCOPE_LIST,
	REPORT_WRITE_SENTINEL,
	TOOL_ANY_OF_SCOPES,
	TOOL_REQUIRED_SCOPE
} from './scopes';
import type { McpContext, McpErrorCode } from './types';
import { registerAllMcpTools, type AuditedToolDefinition } from './tools';

const HERE = dirname(fileURLToPath(import.meta.url));
/** `src/lib/server/mcp` → repo root */
const REPO_ROOT = join(HERE, '../../../..');

/** Checked-in markdown path (repo-relative). */
export const MCP_TOOLS_DOCS_REL = 'docs/mcp-tools.md';

export function mcpToolsDocsAbsolutePath(repoRoot = REPO_ROOT): string {
	return join(repoRoot, MCP_TOOLS_DOCS_REL);
}

/** Auth key format documented from `auth.ts` KEY_RE (do not invent). */
export const MCP_KEY_FORMAT = 'mowa_<prefix10 [a-z0-9]>_<secret43 base64url>';

/** Production Streamable HTTP endpoint (`src/routes/api/mcp/+server.ts`). */
export const MCP_PRODUCTION_URL = 'https://mo-wa.pages.dev/api/mcp';

/** Body size gate from `+server.ts` MAX_BODY. */
export const MCP_MAX_BODY_BYTES = 1_500_000;

/** Tool-level error codes from `types.ts` McpErrorCode. */
export const MCP_ERROR_CODES: readonly McpErrorCode[] = [
	'VALIDATION',
	'FORBIDDEN_SCOPE',
	'NOT_FOUND',
	'CONFLICT',
	'RATE_LIMITED',
	'PAYLOAD_TOO_LARGE',
	'INTERNAL'
] as const;

const RULE_ID_RE = /\bR-[A-Z]+-\d+\b/g;

const TOOL_MODULE_FILES = [
	'read.ts',
	'portfolio.ts',
	'principles.ts',
	'reports.ts',
	'journal.ts',
	'market.ts'
] as const;

export type CapturedTool = {
	name: string;
	title: string;
	description: string;
	inputSchema: Record<string, z.ZodType>;
	outputSchema?: Record<string, z.ZodType>;
	annotations?: AuditedToolDefinition['annotations'];
};

export type ToolDocEntry = {
	name: string;
	title: string;
	description: string;
	requiredScope: string;
	anyOfScopes: readonly string[] | null;
	inputJsonSchema: Record<string, unknown>;
	outputJsonSchema: Record<string, unknown> | null;
	annotations: AuditedToolDefinition['annotations'] | null;
	ruleIds: string[];
	sourceFile: string;
};

/** Every scope that unlocks at least one registered tool (for catalog capture). */
export function scopesUnlockingAllTools(): string[] {
	const scopes = new Set<string>();
	for (const name of ALL_MCP_TOOL_NAMES) {
		const anyOf = TOOL_ANY_OF_SCOPES[name];
		if (anyOf) {
			for (const s of anyOf) scopes.add(s);
			continue;
		}
		const required = TOOL_REQUIRED_SCOPE[name];
		if (required && required !== REPORT_WRITE_SENTINEL && required !== EVENT_WRITE_SENTINEL) {
			scopes.add(required);
		}
	}
	return [...scopes].sort();
}

function stubCtx(scopes: readonly string[]): McpContext {
	return {
		botClientId: '00000000-0000-4000-8000-0000000000doc',
		ownerId: '00000000-0000-4000-8000-0000000000aa',
		profile: 'finance-manager',
		scopes: Object.freeze([...scopes]),
		botName: 'docs-catalog',
		mode: 'db'
	};
}

/** Register every tool into a capturing fake server (live zod shapes, no I/O). */
export function collectRegisteredTools(): CapturedTool[] {
	const captured: CapturedTool[] = [];
	const server = {
		registerTool(
			name: string,
			config: {
				title?: string;
				description?: string;
				inputSchema?: Record<string, z.ZodType>;
				outputSchema?: Record<string, z.ZodType>;
				annotations?: AuditedToolDefinition['annotations'];
			}
		) {
			captured.push({
				name,
				title: config.title ?? name,
				description: config.description ?? '',
				inputSchema: config.inputSchema ?? {},
				...(config.outputSchema ? { outputSchema: config.outputSchema } : {}),
				...(config.annotations ? { annotations: config.annotations } : {})
			});
		}
	};

	registerAllMcpTools({
		server: server as unknown as McpServer,
		ctx: stubCtx(scopesUnlockingAllTools()),
		repo: null,
		recorder: { record() {}, async drain() {} },
		metaBase: {}
	});

	captured.sort((a, b) => a.name.localeCompare(b.name));
	return captured;
}

function shapeToJsonSchema(shape: Record<string, z.ZodType>): Record<string, unknown> {
	const schema = z.toJSONSchema(z.object(shape), { target: 'draft-7' }) as Record<string, unknown>;
	// Drop $schema noise for readable committed docs.
	const rest = { ...schema };
	delete rest.$schema;
	return rest;
}

function loadToolModuleSources(repoRoot = REPO_ROOT): Map<string, string> {
	const map = new Map<string, string>();
	for (const file of TOOL_MODULE_FILES) {
		const abs = join(repoRoot, 'src/lib/server/mcp/tools', file);
		map.set(file, readFileSync(abs, 'utf8'));
	}
	return map;
}

function sourceFileForTool(name: string, sources: Map<string, string>): string {
	const needle = `name: '${name}'`;
	for (const [file, src] of sources) {
		if (src.includes(needle)) return file;
	}
	throw new Error(`BE-14: could not locate source file for tool '${name}'`);
}

function uniqueSorted(ids: Iterable<string>): string[] {
	return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function ruleIdsInText(text: string): string[] {
	return uniqueSorted(text.match(RULE_ID_RE) ?? []);
}

export function buildToolDocEntries(repoRoot = REPO_ROOT): ToolDocEntry[] {
	const sources = loadToolModuleSources(repoRoot);
	const tools = collectRegisteredTools();
	const names = new Set(tools.map((t) => t.name));
	for (const expected of ALL_MCP_TOOL_NAMES) {
		if (!names.has(expected)) {
			throw new Error(`BE-14: registered tools missing '${expected}' from ALL_MCP_TOOL_NAMES`);
		}
	}
	for (const name of names) {
		if (!Object.hasOwn(TOOL_REQUIRED_SCOPE, name)) {
			throw new Error(`BE-14: captured tool '${name}' is not in TOOL_REQUIRED_SCOPE`);
		}
	}

	return tools.map((tool) => {
		const sourceFile = sourceFileForTool(tool.name, sources);
		const moduleSrc = sources.get(sourceFile) ?? '';
		return {
			name: tool.name,
			title: tool.title,
			description: tool.description,
			requiredScope: TOOL_REQUIRED_SCOPE[tool.name] ?? '(unregistered)',
			anyOfScopes: TOOL_ANY_OF_SCOPES[tool.name] ?? null,
			inputJsonSchema: shapeToJsonSchema(tool.inputSchema),
			outputJsonSchema: tool.outputSchema ? shapeToJsonSchema(tool.outputSchema) : null,
			annotations: tool.annotations ?? null,
			ruleIds: uniqueSorted([...ruleIdsInText(tool.description), ...ruleIdsInText(moduleSrc)]),
			sourceFile
		};
	});
}

function fence(lang: string, body: string): string {
	return `\`\`\`${lang}\n${body}\n\`\`\``;
}

function renderOperatorGuide(): string {
	const lines: string[] = [
		'## Operator connection guide',
		'',
		'Assembled from `src/routes/api/mcp/+server.ts`, `src/lib/server/mcp/auth.ts`,',
		'`handler.ts`, `errors.ts`, `scopes.ts`, and `types.ts`. Do not treat this as a',
		'separate contract — if code and this section disagree, code wins; regenerate.',
		'',
		'### Endpoint',
		'',
		`- Production: \`POST ${MCP_PRODUCTION_URL}\``,
		'- Transport: MCP **Streamable HTTP**, **stateless** (new server + transport per request;',
		'  `sessionIdGenerator: undefined`, `enableJsonResponse: true` in `handler.ts`)',
		'- Allowed HTTP method: **POST only** (`GET` / `DELETE` → `405` with `Allow: POST`)',
		`- Max body: \`${MCP_MAX_BODY_BYTES}\` bytes (\`content-length\`); over → \`413\` \`payload_too_large\``,
		'- Browser `Origin` (when present) must match `https://([a-z0-9-]+.)?mo-wa.pages.dev`; else `403` `origin_not_allowed`',
		'',
		'### Bearer authentication',
		'',
		'- Header: `Authorization: Bearer <key>`',
		`- Key format (from \`auth.ts\`): \`${MCP_KEY_FORMAT}\``,
		'  - prefix: 10 chars `[a-z0-9]`',
		'  - secret: 43 chars base64url (`[A-Za-z0-9_-]`)',
		'- Client header `x-mowa-bot-id` is **never** read; identity comes only from the authenticated key',
		'',
		'### HTTP auth / gate responses',
		'',
		'| Status | When | Headers / body |',
		'| --- | --- | --- |',
		'| `401` | missing/malformed key, or invalid key | `WWW-Authenticate: Bearer realm="mo-wa-mcp"`; JSON `{ "error": "<reason>" }` (`missing_or_malformed_key` / `invalid_key`) |',
		'| `429` | DB auth `allowed=false` (rate limited) | `Retry-After: <seconds>` (from `retry_after_s`, default 60); JSON `{ "error": "rate_limited" }` |',
		'| `500` | misconfigured pepper/mode or auth backend error | JSON `{ "error": "server_misconfigured" }` or `auth_backend_error` |',
		'| `413` | body too large | `{ "error": "payload_too_large" }` |',
		'| `403` | disallowed Origin | `{ "error": "origin_not_allowed" }` |',
		'',
		'### Tool result envelopes',
		'',
		'Success (`errors.ts` `mcpSuccess`): `content` text JSON + `structuredContent` (optional `warnings: McpRuleIssue[]`).',
		'',
		'Error (`mcpError` / `isError: true`):',
		'',
		fence(
			'json',
			JSON.stringify(
				{
					isError: true,
					structuredContent: {
						code: 'VALIDATION',
						errors: [{ rule: 'R-…', field: 'optional', message: '…' }]
					}
				},
				null,
				2
			)
		),
		'',
		`Tool error \`code\` values (\`McpErrorCode\`): ${MCP_ERROR_CODES.map((c) => `\`${c}\``).join(', ')}.`,
		'',
		'Notable gate rule IDs from `errors.ts` / `tool-gate.ts` / `scopes.ts`:',
		'',
		'- `R-PERM-04` — tool out of scope or unknown (`forbiddenScopeError` / `assertToolScope`)',
		'- `R-PERM-03` — identity mismatch (audit / tool-gate)',
		'- `R-SYS-05` — internal error envelope (`internalError`)',
		'',
		'### Scopes (summary)',
		'',
		`- Tool → required scope: \`TOOL_REQUIRED_SCOPE\` in \`scopes.ts\` (sentinels \`${REPORT_WRITE_SENTINEL}\` / \`${EVENT_WRITE_SENTINEL}\` mean any-of write scopes).`,
		'- `import:all` unlocks non-proposal tools (`importAllUnlocksTool`); proposal tools stay finance-manager propose scopes only:',
		`  ${[...PROPOSAL_TOOLS]
			.sort()
			.map((t) => `\`${t}\``)
			.join(', ')}`,
		'- Report kind → write scope (`REPORT_KIND_TO_SCOPE`):',
		''
	];

	for (const [kind, scope] of Object.entries(REPORT_KIND_TO_SCOPE)) {
		lines.push(`  - \`${kind}\` → \`${scope}\``);
	}
	lines.push('');
	lines.push(
		`- Report write scope list: ${REPORT_WRITE_SCOPE_LIST.map((s) => `\`${s}\``).join(', ')}`
	);
	lines.push('');
	return lines.join('\n');
}

function renderToolSection(entry: ToolDocEntry): string {
	const lines: string[] = [
		`### \`${entry.name}\``,
		'',
		`- **Title:** ${entry.title}`,
		`- **Source:** \`src/lib/server/mcp/tools/${entry.sourceFile}\``,
		`- **Required scope:** \`${entry.requiredScope}\``
	];
	if (entry.anyOfScopes) {
		lines.push(`- **Any-of scopes:** ${entry.anyOfScopes.map((s) => `\`${s}\``).join(' | ')}`);
	}
	if (entry.annotations) {
		const ann = Object.entries(entry.annotations)
			.filter(([, v]) => v !== undefined)
			.map(([k, v]) => `${k}=${String(v)}`)
			.join(', ');
		if (ann) lines.push(`- **Annotations:** ${ann}`);
	}
	lines.push('');
	lines.push(entry.description);
	lines.push('');
	lines.push('#### Input JSON Schema');
	lines.push('');
	lines.push(fence('json', JSON.stringify(entry.inputJsonSchema, null, 2)));
	lines.push('');
	if (entry.outputJsonSchema) {
		lines.push('#### Output JSON Schema');
		lines.push('');
		lines.push(fence('json', JSON.stringify(entry.outputJsonSchema, null, 2)));
		lines.push('');
	}
	if (entry.ruleIds.length > 0) {
		lines.push('#### Notable rule IDs (from description + implementing module)');
		lines.push('');
		lines.push(entry.ruleIds.map((id) => `\`${id}\``).join(', '));
		lines.push('');
	}
	return lines.join('\n');
}

/** Full markdown for docs/mcp-tools.md. */
export function renderMcpToolsDocs(repoRoot = REPO_ROOT): string {
	const entries = buildToolDocEntries(repoRoot);
	const parts: string[] = [
		'# MCP tools reference',
		'',
		'> **Generated file — do not edit by hand.**',
		'>',
		'> Regenerate: `pnpm docs:mcp-tools`',
		'>',
		'> Source: live zod `inputSchema` shapes registered by `registerAllMcpTools`,',
		'> converted with `z.toJSONSchema`. Drift is gated by',
		'> `src/lib/server/mcp/generate-mcp-tools-docs.spec.ts`.',
		'',
		renderOperatorGuide(),
		'## Tools',
		'',
		`Registered tools: **${entries.length}** (must match \`ALL_MCP_TOOL_NAMES\`).`,
		''
	];

	for (const entry of entries) {
		parts.push(renderToolSection(entry));
	}

	parts.push('---');
	parts.push('');
	parts.push(`_Generated for BE-14 from schemas at build/docs time._`);
	parts.push('');
	return parts.join('\n');
}
