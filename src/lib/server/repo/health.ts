/**
 * Read-only database health helpers for MCP / ops.
 * Uses the admin client (allowed only under repo/** per R-SYS-01).
 */
import { createSupabaseAdminClient } from '$lib/supabase/admin';

export type DatabasePingResult = {
	ok: boolean;
	latency_ms: number;
	error?: string;
};

/** Head-count profiles — no writes; measures Workers→PostgREST round-trip. */
export async function pingDatabase(): Promise<DatabasePingResult> {
	const t0 = Date.now();
	try {
		const { error } = await createSupabaseAdminClient()
			.from('profiles')
			.select('id', { count: 'exact', head: true });
		return {
			ok: !error,
			latency_ms: Date.now() - t0,
			...(error ? { error: error.message } : {})
		};
	} catch (e) {
		return { ok: false, latency_ms: Date.now() - t0, error: (e as Error).message };
	}
}
