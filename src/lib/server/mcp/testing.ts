/**
 * Test-only MCP helpers.
 * NOT exported from the package barrel — import from this path in specs only.
 * Throws when NODE_ENV is unset, and outside development / test.
 */
import type { McpAuthProvider, McpContext } from './types';

function assertDevOrTest(): void {
	const raw = typeof process !== 'undefined' ? process.env.NODE_ENV : undefined;
	if (raw === undefined || raw === '') {
		throw new Error('UNSAFE_: $lib/server/mcp/testing.ts requires NODE_ENV=test|development');
	}
	const viteDev =
		typeof import.meta !== 'undefined' &&
		Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
	const allowed = raw === 'test' || raw === 'development' || viteDev;
	if (!allowed) {
		throw new Error(
			'UNSAFE_: $lib/server/mcp/testing.ts is test/dev only — refuse outside development/test'
		);
	}
}

/** Deterministic stub context for unit tests. */
export function createStubMcpContext(overrides: Partial<McpContext> = {}): McpContext {
	assertDevOrTest();
	return {
		botClientId: overrides.botClientId ?? '00000000-0000-4000-8000-000000000001',
		ownerId: overrides.ownerId ?? '00000000-0000-4000-8000-0000000000aa',
		profile: overrides.profile ?? 'finance-manager',
		scopes: overrides.scopes ?? ['read'],
		botName: overrides.botName ?? 'stub-bot',
		mode: overrides.mode ?? 'db'
	};
}

export function createStubAuthProvider(ctx?: McpContext): McpAuthProvider {
	assertDevOrTest();
	const resolved = ctx ?? createStubMcpContext();
	return {
		async resolve() {
			return resolved;
		}
	};
}
