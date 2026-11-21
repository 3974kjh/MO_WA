import type { McpContext } from './types';

/**
 * Auth context provider for MCP (BE-04 will implement DB mode).
 * BE-05 only defines the contract + a test stub so later tickets can hook in.
 */
export type McpAuthProvider = {
	/** Resolve authenticated context for a request. Throws or returns null on failure. */
	resolve(request: Request): Promise<McpContext | null>;
};

/** Deterministic stub for unit tests and local hooks until BE-04 lands. */
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
