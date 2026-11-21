import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	buildToolDocEntries,
	collectRegisteredTools,
	mcpToolsDocsAbsolutePath,
	renderMcpToolsDocs,
	scopesUnlockingAllTools
} from './generate-mcp-tools-docs';
import { ALL_MCP_TOOL_NAMES, TOOL_REQUIRED_SCOPE } from './scopes';

describe('BE-14 MCP tools docs generation', () => {
	it('captures every TOOL_REQUIRED_SCOPE tool via registerAllMcpTools', () => {
		const tools = collectRegisteredTools();
		expect(tools.map((t) => t.name).sort()).toEqual([...ALL_MCP_TOOL_NAMES].sort());
		expect(scopesUnlockingAllTools().length).toBeGreaterThan(0);
	});

	it('builds JSON Schema entries without inventing tools', () => {
		const entries = buildToolDocEntries();
		expect(entries).toHaveLength(Object.keys(TOOL_REQUIRED_SCOPE).length);
		for (const entry of entries) {
			expect(entry.inputJsonSchema).toMatchObject({ type: 'object' });
			expect(entry.requiredScope).toBe(TOOL_REQUIRED_SCOPE[entry.name]);
		}
	});

	it('docs/mcp-tools.md matches live zod schemas (set GENERATE_MCP_TOOLS_DOCS=1 to refresh)', () => {
		const expected = renderMcpToolsDocs();
		const path = mcpToolsDocsAbsolutePath();
		if (process.env.GENERATE_MCP_TOOLS_DOCS === '1') {
			writeFileSync(path, expected, 'utf8');
		}
		const actual = readFileSync(path, 'utf8');
		expect(actual).toBe(expected);
	});
});
