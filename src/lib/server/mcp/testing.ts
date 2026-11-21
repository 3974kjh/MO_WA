/**
 * Test-only MCP helpers (M-4).
 * NOT exported from the package barrel — import from this path in specs only.
 */
import type { McpAuthProvider, McpContext } from './types';

/** Deterministic stub context for unit tests. */
export function createStubMcpContext(overrides: Partial<McpContext> = {}): McpContext {
	return {
		botClientId: overrides.botClientId ?? '00000000-0000-4000-8000-000000000001',
		ownerId: overrides.ownerId ?? '00000000-0000-4000-8000-0000000000aa',
		profile: overrides.profile ?? 'finance-manager',
		scopes: overrides.scopes ?? ['read'],
		botName: overrides.botName ?? 'stub-bot'
	};
}

export function createStubAuthProvider(ctx: McpContext = createStubMcpContext()): McpAuthProvider {
	return {
		async resolve() {
			return ctx;
		}
	};
}
