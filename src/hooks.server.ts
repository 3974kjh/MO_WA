import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase/server';

export const handle: Handle = async ({ event, resolve }) => {
	// MCP는 Bearer 키로 자체 인증한다. 쿠키 세션 조회(Auth 왕복)를 건너뛴다.
	if (event.url.pathname.startsWith('/api/mcp')) return resolve(event);

	event.locals.supabase = createSupabaseServerClient(event.cookies);

	const {
		data: { session }
	} = await event.locals.supabase.auth.getSession();

	event.locals.session = session;
	event.locals.user = session?.user ?? null;

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
