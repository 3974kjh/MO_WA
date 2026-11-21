#!/usr/bin/env node
/**
 * Local-only migration applicator (BE-01 hardening).
 * Default: dry-run. Requires --apply to execute.
 * Ignores DATABASE_URL / remote poolers. Uses MOWA_DB_* loopback only.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { resolveMowaDbEnv, LOCAL_STACK_DB_RE } from './lib/local-db-guard.mjs';

const { Client } = pg;

function loadEnvFile(path = '.env') {
	const values = {};
	try {
		for (const line of readFileSync(path, 'utf8').split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const index = trimmed.indexOf('=');
			if (index === -1) continue;
			values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
		}
	} catch {
		/* optional */
	}
	return values;
}

function loadStackEnv() {
	const p = join(process.cwd(), '.local/stack.env');
	if (!existsSync(p)) return {};
	return loadEnvFile(p);
}

async function main() {
	const apply = process.argv.includes('--apply');
	// Prefer .local/stack.env MOWA_DB_*; never use DATABASE_URL from shell/.env.
	const fileEnv = { ...loadEnvFile(), ...loadStackEnv() };
	const env = {
		MOWA_DB_HOST: process.env.MOWA_DB_HOST ?? fileEnv.MOWA_DB_HOST,
		MOWA_DB_PORT: process.env.MOWA_DB_PORT ?? fileEnv.MOWA_DB_PORT,
		MOWA_DB_USER: process.env.MOWA_DB_USER ?? fileEnv.MOWA_DB_USER,
		MOWA_DB_PASSWORD: process.env.MOWA_DB_PASSWORD ?? fileEnv.MOWA_DB_PASSWORD,
		MOWA_DB_NAME: process.env.MOWA_DB_NAME ?? fileEnv.MOWA_DB_NAME
	};
	const db = resolveMowaDbEnv(env, { dbNameRe: LOCAL_STACK_DB_RE, label: 'db:migrate' });

	const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
	const files = readdirSync(migrationsDir)
		.filter((file) => file.endsWith('.sql') && !file.endsWith('.sql.txt'))
		.sort();

	console.log(`target ${db.host}:${db.port}/${db.dbName} (${apply ? 'APPLY' : 'dry-run'})`);
	if (files.length === 0) {
		console.log('적용할 migration 파일이 없습니다.');
		return;
	}

	if (!apply) {
		for (const file of files) console.log(`dry-run would apply ${file}`);
		console.log('Dry-run only. Re-run with --apply against loopback mowa_local* to execute.');
		return;
	}

	const client = new Client({
		host: db.host,
		port: Number(db.port),
		user: db.user,
		password: db.password,
		database: db.dbName,
		connectionTimeoutMillis: 10_000
		// no ssl / no remote pooler fallback
	});
	await client.connect();

	await client.query(`
		create schema if not exists supabase_migrations;
		create table if not exists supabase_migrations.schema_migrations (
			version text primary key,
			applied_at timestamptz not null default now()
		);
	`);

	for (const file of files) {
		const version = file.replace(/\.sql$/, '');
		const exists = await client.query(
			'select 1 from supabase_migrations.schema_migrations where version = $1',
			[version]
		);
		if (exists.rowCount > 0) {
			console.log(`skip  ${file} (already applied)`);
			continue;
		}
		const sql = readFileSync(join(migrationsDir, file), 'utf8');
		console.log(`apply ${file}`);
		await client.query('begin');
		try {
			await client.query(sql);
			await client.query(
				'insert into supabase_migrations.schema_migrations (version) values ($1) on conflict do nothing',
				[version]
			);
			await client.query('commit');
			console.log(`done  ${file}`);
		} catch (error) {
			await client.query('rollback');
			throw error;
		}
	}

	await client.end();
	console.log('Migration 적용 완료 (local only).');
}

main().catch((error) => {
	console.error('Migration 적용 실패:', error.message);
	process.exit(1);
});
