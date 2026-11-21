import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase/server';
import { getSupabasePublicConfig } from '$lib/supabase/config';
import {
	cache,
	isMcpApiPath,
	resolveAuthenticatedUser
} from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	// MCP uses Bearer keys; skip cookie Auth round-trips (BE-02 / M-3).
	if (isMcpApiPath(event.url.pathname)) {
		event.locals.user = null;
		if (!event.request.headers.get('authorization')) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
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

	event.locals.supabase = createSupabaseServerClient(event.cookies);

	event.locals.getUser = cache(() => event.locals.supabase.auth.getUser());
	const resolution = resolveAuthenticatedUser(await event.locals.getUser());

	if (resolution.kind === 'unavailable') {
		console.error(`[auth] Auth unavailable (${resolution.reason}); returning 503`);
		return new Response('Service Unavailable', { status: 503 });
	}

	event.locals.user = resolution.user;

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
