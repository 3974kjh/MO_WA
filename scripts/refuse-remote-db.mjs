#!/usr/bin/env node
/**
 * Refuse supabase db push / db reset against remote targets.
 * BE-01: these commands must not hit operational databases.
 */
console.error(
	'Refused: db:push / db:reset are disabled for remote safety.\n' +
		'Use `pnpm db:local:up` (loopback mowa_local only) or `pnpm db:migrate` (dry-run; --apply for local).'
);
process.exit(1);
