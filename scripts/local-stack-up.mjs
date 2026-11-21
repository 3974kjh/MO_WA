#!/usr/bin/env node
/**
 * BE-01 local stack: Postgres roles/auth bootstrap + apply supabase/migrations/*.sql
 * Does NOT apply GATED_drop_legacy_finance_tables.sql.txt
 * Does NOT touch remote/staging/production.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dbName = process.env.MOWA_DB_NAME ?? 'mowa_local';
const dbHost = process.env.MOWA_DB_HOST ?? '127.0.0.1';
const dbPort = process.env.MOWA_DB_PORT ?? '5432';
const dbUser = process.env.MOWA_DB_USER ?? 'postgres';
const dbPass = process.env.MOWA_DB_PASSWORD ?? 'postgres';
const authPass = process.env.MOWA_AUTHENTICATOR_PASSWORD ?? 'mowa_local_auth';
const jwtSecret =
	process.env.MOWA_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
const postgrestPort = process.env.MOWA_POSTGREST_PORT ?? '54321';

function psql(args, input) {
	const env = { ...process.env, PGPASSWORD: dbPass };
	const r = spawnSync('psql', ['-h', dbHost, '-p', dbPort, '-U', dbUser, '-v', 'ON_ERROR_STOP=1', ...args], {
		input,
		env,
		encoding: 'utf8'
	});
	if (r.status !== 0) {
		console.error(r.stdout);
		console.error(r.stderr);
		throw new Error(`psql failed: ${args.join(' ')}`);
	}
	return r.stdout;
}

const bootstrap = `
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE mowa_authenticator LOGIN PASSWORD '${authPass.replace(/'/g, "''")}' NOINHERIT;
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE mowa_authenticator WITH LOGIN PASSWORD '${authPass.replace(/'/g, "''")}' NOINHERIT;
END $$;
GRANT anon, authenticated, service_role TO mowa_authenticator;
GRANT anon, authenticated, service_role TO ${dbUser};

SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname = '${dbName}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${dbName};
CREATE DATABASE ${dbName} OWNER ${dbUser};
`;

psql(['-d', 'postgres'], bootstrap);

const authSetup = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
-- Install into public so security-definer functions with
-- search_path=public,pg_temp can resolve digest()/pgcrypto (matches draft migrations).
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
ALTER DATABASE ${dbName} SET search_path TO public, extensions;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid
$fn$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '')
$fn$;

GRANT USAGE ON SCHEMA auth, public, extensions TO anon, authenticated, service_role, mowa_authenticator;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role, mowa_authenticator;
GRANT ALL ON SCHEMA public TO ${dbUser}, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

psql(['-d', dbName], authSetup);

const migDir = join(root, 'supabase/migrations');
const files = readdirSync(migDir)
	.filter((f) => f.endsWith('.sql') && !f.endsWith('.sql.txt'))
	.sort();

for (const f of files) {
	const path = join(migDir, f);
	console.log('apply', f);
	psql(['-d', dbName, '-f', path]);
}

mkdirSync(join(root, '.local'), { recursive: true });
const conf = `
db-uri = "postgres://mowa_authenticator:${authPass}@${dbHost}:${dbPort}/${dbName}"
db-schemas = "public"
db-anon-role = "anon"
server-port = ${postgrestPort}
jwt-secret = "${jwtSecret}"
`;
const confPath = join(root, '.local/postgrest.conf');
writeFileSync(confPath, conf);
writeFileSync(
	join(root, '.local/stack.env'),
	[
		`DATABASE_URL=postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`,
		`MOWA_POSTGREST_URL=http://127.0.0.1:${postgrestPort}`,
		`MOWA_JWT_SECRET=${jwtSecret}`,
		`MOWA_ANON_ROLE=anon`,
		`MOWA_SERVICE_ROLE=service_role`,
		`MOWA_AUTHENTICATOR_PASSWORD=${authPass}`,
		''
	].join('\n')
);

console.log('local stack ready');
console.log(`DATABASE_URL=postgresql://${dbUser}:***@${dbHost}:${dbPort}/${dbName}`);
console.log(`PostgREST conf: ${confPath}`);
console.log(`Start: postgrest ${confPath}`);
