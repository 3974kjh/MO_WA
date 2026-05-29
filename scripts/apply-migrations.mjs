#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Client } = pg;

function loadEnvFile(path = '.env') {
	const values = {};
	try {
		for (const line of readFileSync(path, 'utf8').split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const index = trimmed.indexOf('=');
			if (index === -1) continue;
			const key = trimmed.slice(0, index).trim();
			const value = trimmed.slice(index + 1).trim();
			values[key] = value;
		}
	} catch {
		// .env optional if env vars already exported
	}
	return values;
}

function projectRefFromUrl(url) {
	const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
	return match?.[1] ?? null;
}

function resolveDatabaseUrl(env) {
	if (env.DATABASE_URL) return env.DATABASE_URL;

	const password = env.SUPABASE_DB_PASSWORD;
	const projectRef = projectRefFromUrl(env.PUBLIC_SUPABASE_URL ?? '');

	if (!password || !projectRef) {
		throw new Error(
			'DATABASE_URL 또는 PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD 가 .env 에 필요합니다.'
		);
	}

	const encodedPassword = encodeURIComponent(password);

	if (env.SUPABASE_DB_POOLER_HOST) {
		const port = env.SUPABASE_DB_POOLER_PORT ?? '5432';
		return `postgresql://postgres.${projectRef}:${encodedPassword}@${env.SUPABASE_DB_POOLER_HOST}:${port}/postgres`;
	}

	// Direct connection (legacy projects)
	return `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;
}

async function connectClient(databaseUrl, env) {
	const client = new Client({
		connectionString: databaseUrl,
		ssl: { rejectUnauthorized: false },
		connectionTimeoutMillis: 10_000
	});

	try {
		await client.connect();
		return client;
	} catch (error) {
		await client.end().catch(() => undefined);

		const projectRef = projectRefFromUrl(env.PUBLIC_SUPABASE_URL ?? '');
		const password = encodeURIComponent(env.SUPABASE_DB_PASSWORD ?? '');
		const fallbackHosts = [
			env.SUPABASE_DB_POOLER_HOST,
			'aws-1-ap-northeast-1.pooler.supabase.com',
			'aws-0-ap-northeast-2.pooler.supabase.com',
			'aws-0-ap-northeast-1.pooler.supabase.com'
		].filter(Boolean);

		for (const host of fallbackHosts) {
			for (const port of ['5432', '6543']) {
				const poolerUrl = `postgresql://postgres.${projectRef}:${password}@${host}:${port}/postgres`;
				if (poolerUrl === databaseUrl) continue;

				const fallback = new Client({
					connectionString: poolerUrl,
					ssl: { rejectUnauthorized: false },
					connectionTimeoutMillis: 10_000
				});

				try {
					await fallback.connect();
					console.log(`connected via pooler ${host}:${port}`);
					return fallback;
				} catch {
					await fallback.end().catch(() => undefined);
				}
			}
		}

		throw error;
	}
}

async function ensureMigrationsTable(client) {
	await client.query(`
		create schema if not exists supabase_migrations;
		create table if not exists supabase_migrations.schema_migrations (
			version text primary key,
			applied_at timestamptz not null default now()
		);
	`);
}

async function isApplied(client, version) {
	const result = await client.query(
		'select 1 from supabase_migrations.schema_migrations where version = $1',
		[version]
	);
	return result.rowCount > 0;
}

async function markApplied(client, version) {
	await client.query(
		'insert into supabase_migrations.schema_migrations (version) values ($1) on conflict do nothing',
		[version]
	);
}

async function main() {
	const env = { ...loadEnvFile(), ...process.env };
	const databaseUrl = resolveDatabaseUrl(env);
	const migrationsDir = join(process.cwd(), 'supabase', 'migrations');

	const files = readdirSync(migrationsDir)
		.filter((file) => file.endsWith('.sql'))
		.sort();

	if (files.length === 0) {
		console.log('적용할 migration 파일이 없습니다.');
		return;
	}

	const client = await connectClient(databaseUrl, env);
	await ensureMigrationsTable(client);

	for (const file of files) {
		const version = file.replace(/\.sql$/, '');
		if (await isApplied(client, version)) {
			console.log(`skip  ${file} (already applied)`);
			continue;
		}

		const sql = readFileSync(join(migrationsDir, file), 'utf8');
		console.log(`apply ${file}`);

		await client.query('begin');
		try {
			await client.query(sql);
			await markApplied(client, version);
			await client.query('commit');
			console.log(`done  ${file}`);
		} catch (error) {
			await client.query('rollback');
			throw error;
		}
	}

	await client.end();
	console.log('Migration 적용 완료.');
}

main().catch((error) => {
	console.error('Migration 적용 실패:', error.message);
	process.exit(1);
});
