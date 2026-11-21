/**
 * Shared local-only DB target guards for BE-01 scripts.
 * Never allow remote/staging/production hosts.
 */

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

/** local-stack-up may use mowa_local or mowa_local_<suffix> */
export const LOCAL_STACK_DB_RE = /^mowa_local(_\w+)?$/;

/** validate.mjs / test:db: exact name only */
export const VALIDATE_DB_RE = /^mowa_local$/;

export function isLoopbackHost(host) {
	return LOOPBACK.has(String(host || '').trim().toLowerCase());
}

export function quoteIdent(name) {
	const s = String(name);
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
		throw new Error(`Refusing unsafe SQL identifier: ${s}`);
	}
	return `"${s.replace(/"/g, '""')}"`;
}

/**
 * @param {{ host: string, dbName: string, dbNameRe?: RegExp, label?: string }} opts
 */
export function assertLocalDbTarget({ host, dbName, dbNameRe = LOCAL_STACK_DB_RE, label = 'local-db' }) {
	const h = String(host || '').trim();
	const d = String(dbName || '').trim();
	if (!isLoopbackHost(h)) {
		console.error(`[${label}] Refusing non-loopback host "${h}". Only 127.0.0.1 / localhost / ::1.`);
		process.exit(1);
	}
	if (!dbNameRe.test(d)) {
		console.error(`[${label}] Refusing database name "${d}". Must match ${dbNameRe}.`);
		process.exit(1);
	}
	return { host: h === 'localhost' ? '127.0.0.1' : h, dbName: d };
}

/** Ignore DATABASE_URL; build from MOWA_DB_* only. */
export function resolveMowaDbEnv(env = process.env, { dbNameRe = LOCAL_STACK_DB_RE, label = 'local-db' } = {}) {
	const host = env.MOWA_DB_HOST ?? '127.0.0.1';
	const port = env.MOWA_DB_PORT ?? '5432';
	const user = env.MOWA_DB_USER ?? 'postgres';
	const password = env.MOWA_DB_PASSWORD ?? 'postgres';
	const dbName = env.MOWA_DB_NAME ?? 'mowa_local';
	const { host: safeHost, dbName: safeDb } = assertLocalDbTarget({
		host,
		dbName,
		dbNameRe,
		label
	});
	return {
		host: safeHost,
		port: String(port),
		user,
		password,
		dbName: safeDb,
		connectionString: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${safeHost}:${port}/${safeDb}`
	};
}
