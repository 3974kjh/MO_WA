import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase/server';
import { cache, isMcpApiPath, resolveAuthenticatedUser } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	// MCP uses Bearer keys; skip cookie Auth round-trips (BE-02).
	if (isMcpApiPath(event.url.pathname)) {
		return resolve(event);
	}

	event.locals.supabase = createSupabaseServerClient(event.cookies);

	event.locals.getUser = cache(() => event.locals.supabase.auth.getUser());
	event.locals.user = resolveAuthenticatedUser(await event.locals.getUser());

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
