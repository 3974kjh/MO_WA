#!/usr/bin/env node
/**
 * BE-14 — Regenerate docs/mcp-tools.generated.md from live MCP zod schemas.
 * The Korean guide docs/mcp-tools.md is hand-written and never touched.
 *
 * Runs the server vitest project with GENERATE_MCP_TOOLS_DOCS=1 so the drift
 * spec writes the file, then re-asserts it matches.
 *
 * Usage: pnpm docs:mcp-tools
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = 'src/lib/server/mcp/generate-mcp-tools-docs.spec.ts';

const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--project', 'server', spec], {
	cwd: root,
	env: { ...process.env, GENERATE_MCP_TOOLS_DOCS: '1' },
	stdio: 'inherit'
});

process.exit(result.status === null ? 1 : result.status);
