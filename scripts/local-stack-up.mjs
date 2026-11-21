#!/usr/bin/env node
/**
 * BE-01 local stack: Postgres roles/auth bootstrap + apply supabase/migrations/*.sql
 * Does NOT apply GATED_drop_legacy_finance_tables.sql.txt
 * Does NOT touch remote/staging/production.
 * Target must be loopback + mowa_local(_suffix)?; otherwise exit.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDbTarget, quoteIdent, resolveMowaDbEnv, LOCAL_STACK_DB_RE } from './lib/local-db-guard.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const db = resolveMowaDbEnv(process.env, { dbNameRe: LOCAL_STACK_DB_RE, label: 'local-stack-up' });
assertLocalDbTarget({ host: db.host, dbName: db.dbName, dbNameRe: LOCAL_STACK_DB_RE, label: 'local-stack-up' });

const authPass = process.env.MOWA_AUTHENTICATOR_PASSWORD ?? 'mowa_local_auth';
const jwtSecret =
	process.env.MOWA_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
const postgrestPort = process.env.MOWA_POSTGREST_PORT ?? '54321';

const qDb = quoteIdent(db.dbName);
const qUser = quoteIdent(db.user);
const authPassLit = authPass.replace(/'/g, "''");

function psql(args, input) {
	const env = { ...process.env, PGPASSWORD: db.password };
	// Strip any DATABASE_URL so psql cannot be redirected remotely via libpq.
	delete env.DATABASE_URL;
	delete env.PGHOSTADDR;
	const r = spawnSync(
		'psql',
		['-h', db.host, '-p', db.port, '-U', db.user, '-v', 'ON_ERROR_STOP=1', ...args],
		{ input, env, encoding: 'utf8' }
	);
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
  CREATE ROLE mowa_authenticator LOGIN PASSWORD '${authPassLit}' NOINHERIT;
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE mowa_authenticator WITH LOGIN PASSWORD '${authPassLit}' NOINHERIT;
END $$;
GRANT anon, authenticated, service_role TO mowa_authenticator;
GRANT anon, authenticated, service_role TO ${qUser};

SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname = ${literal(db.dbName)} AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${qDb};
CREATE DATABASE ${qDb} OWNER ${qUser};
`;

function literal(s) {
	return `'${String(s).replace(/'/g, "''")}'`;
}

psql(['-d', 'postgres'], bootstrap);

const authSetup = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
-- Match Supabase: pgcrypto lives in extensions (not public).
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
ALTER DATABASE ${qDb} SET search_path TO public, extensions;

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
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role, mowa_authenticator;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated, service_role, mowa_authenticator;
GRANT ALL ON SCHEMA public TO ${qUser}, anon, authenticated, service_role;
-- Defaults must not give anon EXECUTE, authenticated TRUNCATE/DELETE, or PUBLIC EXECUTE.
-- Schema-less PUBLIC EXECUTE revoke is required (schema-scoped alone is a false fix).
-- FOR ROLE postgres: hosted (current_user=postgres) must run unconditionally (never silently skip).
DO $mowa_pg$
BEGIN
  IF current_user = 'postgres' THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
        AND pg_has_role(current_user, 'postgres', 'USAGE') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
  ELSE
    RAISE NOTICE 'skip ALTER DEFAULT PRIVILEGES FOR ROLE postgres: role missing or current_user lacks USAGE';
  END IF;
END
$mowa_pg$;
DO $mowa_cu$
BEGIN
  IF current_user IS DISTINCT FROM 'postgres' THEN
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
      current_user
    );
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'skip ALTER DEFAULT PRIVILEGES FOR ROLE %: insufficient_privilege', current_user;
END
$mowa_cu$;
-- supabase_admin only when current_user has USAGE (PG17 needs inheritance/USAGE).
DO $mowa_sa$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND pg_has_role(current_user, 'supabase_admin', 'USAGE') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
  ELSE
    RAISE NOTICE 'skip ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin: role missing or current_user lacks USAGE';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'skip ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin: insufficient_privilege';
END
$mowa_sa$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, REFERENCES, TRIGGER ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, DELETE ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
`;

psql(['-d', db.dbName], authSetup);

const migDir = join(root, 'supabase/migrations');
const files = readdirSync(migDir)
	.filter((f) => f.endsWith('.sql') && !f.endsWith('.sql.txt'))
	.sort();

for (const f of files) {
	const path = join(migDir, f);
	console.log('apply', f);
	psql(['-d', db.dbName, '-f', path]);
}

mkdirSync(join(root, '.local'), { recursive: true });
const conf = `
db-uri = "postgres://mowa_authenticator:${authPass}@${db.host}:${db.port}/${db.dbName}"
db-schemas = "public"
db-anon-role = "anon"
server-host = "127.0.0.1"
server-port = ${postgrestPort}
jwt-secret = "${jwtSecret}"
`;
const confPath = join(root, '.local/postgrest.conf');
writeFileSync(confPath, conf);
writeFileSync(
	join(root, '.local/stack.env'),
	[
		`MOWA_DB_HOST=${db.host}`,
		`MOWA_DB_PORT=${db.port}`,
		`MOWA_DB_USER=${db.user}`,
		`MOWA_DB_PASSWORD=${db.password}`,
		`MOWA_DB_NAME=${db.dbName}`,
		`MOWA_POSTGREST_URL=http://127.0.0.1:${postgrestPort}`,
		`MOWA_JWT_SECRET=${jwtSecret}`,
		`MOWA_ANON_ROLE=anon`,
		`MOWA_SERVICE_ROLE=service_role`,
		`MOWA_AUTHENTICATOR_PASSWORD=${authPass}`,
		''
	].join('\n')
);

console.log('local stack ready');
console.log(`MOWA_DB_HOST=${db.host} MOWA_DB_NAME=${db.dbName}`);
console.log(`PostgREST conf: ${confPath} (127.0.0.1 only)`);
console.log(`Start: postgrest ${confPath}`);
