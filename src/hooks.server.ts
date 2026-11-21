import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase/server';
import { getSupabasePublicConfig } from '$lib/supabase/config';
import {
	authUnavailableResponse,
	cache,
	clearSupabaseAuthCookies,
	isMcpApiPath,
	resolveAuthenticatedUser,
	type PendingSetCookie
} from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	// MCP uses Bearer keys; skip cookie Auth round-trips (BE-02 / M-3).
	if (isMcpApiPath(event.url.pathname)) {
		event.locals.user = null;
		// OPTIONS may be unauthenticated; POST must not bypass Bearer auth.
		if (event.request.method === 'OPTIONS') {
			return resolve(event);
		}
		if (!event.request.headers.get('authorization')) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: {
					'content-type': 'application/json',
					'WWW-Authenticate': 'Bearer realm="mo-wa-mcp"'
				}
			});
		}
		return resolve(event);
	}

	const { configured } = getSupabasePublicConfig();
	if (!configured) {
		console.error(
			'[auth] PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing or placeholder; refusing request'
		);
		return new Response('Internal Server Error', { status: 500 });
	}

	// Collect Set-Cookie mutations from Auth (refresh etc.) so 503 can still send them (option B).
	const pendingCookies: PendingSetCookie[] = [];
	event.locals.supabase = createSupabaseServerClient(event.cookies, pendingCookies);

	event.locals.getUser = cache(() => event.locals.supabase.auth.getUser());
	const resolution = resolveAuthenticatedUser(await event.locals.getUser());

	if (resolution.kind === 'unavailable') {
		console.error(`[auth] Auth unavailable (${resolution.reason}); returning 503`);
		// Do not use error(503): SvelteKit does not guarantee Set-Cookie on thrown HttpErrors from hooks.
		// Attach only persistable cookies (skip Auth _removeSession clears) — criterion 3 option B.
		return authUnavailableResponse(pendingCookies, {
			secure: event.url.protocol === 'https:'
		});
	}

	if (resolution.kind === 'anonymous' && resolution.clearCookies) {
		clearSupabaseAuthCookies(event.cookies);
	}

	event.locals.user = resolution.user;

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
