#!/usr/bin/env node
/** supabase db lint against loopback mowa_local only (ignores DATABASE_URL). */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveMowaDbEnv, VALIDATE_DB_RE } from './lib/local-db-guard.mjs';

function loadStackEnv() {
	const p = join(process.cwd(), '.local/stack.env');
	if (!existsSync(p)) return {};
	const out = {};
	for (const line of readFileSync(p, 'utf8').split('\n')) {
		const t = line.trim();
		if (!t || t.startsWith('#') || !t.includes('=')) continue;
		const i = t.indexOf('=');
		out[t.slice(0, i)] = t.slice(i + 1);
	}
	return out;
}

const fileEnv = loadStackEnv();
const env = {
	MOWA_DB_HOST: process.env.MOWA_DB_HOST ?? fileEnv.MOWA_DB_HOST,
	MOWA_DB_PORT: process.env.MOWA_DB_PORT ?? fileEnv.MOWA_DB_PORT,
	MOWA_DB_USER: process.env.MOWA_DB_USER ?? fileEnv.MOWA_DB_USER,
	MOWA_DB_PASSWORD: process.env.MOWA_DB_PASSWORD ?? fileEnv.MOWA_DB_PASSWORD,
	MOWA_DB_NAME: process.env.MOWA_DB_NAME ?? fileEnv.MOWA_DB_NAME ?? 'mowa_local'
};
const db = resolveMowaDbEnv(env, { dbNameRe: VALIDATE_DB_RE, label: 'db:lint:local' });
const url = db.connectionString;
const r = spawnSync('supabase', ['db', 'lint', '--db-url', url, '--fail-on', 'error'], {
	encoding: 'utf8',
	env: { ...process.env, DATABASE_URL: undefined }
});
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
