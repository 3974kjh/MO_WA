// MO_WA M1 schema validation against local Postgres + PostgREST (BE-01).
// B-1: ignores DATABASE_URL; connects via MOWA_DB_* only; aborts unless loopback + mowa_local.
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
	resolveMowaDbEnv,
	VALIDATE_DB_RE,
	assertLoopbackHttpUrl
} from '../scripts/lib/local-db-guard.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const gatedPath = join(root, 'supabase/migrations/GATED_drop_legacy_finance_tables.sql.txt');

function readEnvFile(path) {
	const out = {};
	if (!existsSync(path)) return out;
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const t = line.trim();
		if (!t || t.startsWith('#') || !t.includes('=')) continue;
		const i = t.indexOf('=');
		out[t.slice(0, i)] = t.slice(i + 1);
	}
	return out;
}

// Load .local/stack.env into a copy — never let shell DATABASE_URL win.
const stackFile = readEnvFile(join(root, '.local/stack.env'));
const mowaEnv = {
	MOWA_DB_HOST: process.env.MOWA_DB_HOST ?? stackFile.MOWA_DB_HOST ?? '127.0.0.1',
	MOWA_DB_PORT: process.env.MOWA_DB_PORT ?? stackFile.MOWA_DB_PORT ?? '5432',
	MOWA_DB_USER: process.env.MOWA_DB_USER ?? stackFile.MOWA_DB_USER ?? 'postgres',
	MOWA_DB_PASSWORD: process.env.MOWA_DB_PASSWORD ?? stackFile.MOWA_DB_PASSWORD ?? 'postgres',
	MOWA_DB_NAME: process.env.MOWA_DB_NAME ?? stackFile.MOWA_DB_NAME ?? 'mowa_local',
	MOWA_POSTGREST_URL: process.env.MOWA_POSTGREST_URL ?? stackFile.MOWA_POSTGREST_URL ?? 'http://127.0.0.1:54321',
	MOWA_JWT_SECRET:
		process.env.MOWA_JWT_SECRET ??
		stackFile.MOWA_JWT_SECRET ??
		'super-secret-jwt-token-with-at-least-32-characters-long',
	MOWA_AUTHENTICATOR_PASSWORD:
		process.env.MOWA_AUTHENTICATOR_PASSWORD ?? stackFile.MOWA_AUTHENTICATOR_PASSWORD
};

// Abort before any work if target is not loopback mowa_local.
const dbTarget = resolveMowaDbEnv(mowaEnv, { dbNameRe: VALIDATE_DB_RE, label: 'test:db' });
const postgrestUrl = assertLoopbackHttpUrl(mowaEnv.MOWA_POSTGREST_URL, 'MOWA_POSTGREST_URL');
const jwtSecret = mowaEnv.MOWA_JWT_SECRET;

// Guard self-check: DATABASE_URL must not steer the connection; remote host must abort.
{
	const poisoned = {
		...mowaEnv,
		DATABASE_URL: 'postgresql://postgres:postgres@db.example.supabase.co:5432/postgres'
	};
	const viaGuard = resolveMowaDbEnv(poisoned, { dbNameRe: VALIDATE_DB_RE, label: 'test:db-ignore-database-url' });
	if (viaGuard.host !== dbTarget.host || viaGuard.dbName !== dbTarget.dbName) {
		console.error('DATABASE_URL was not ignored by local-db-guard');
		process.exit(1);
	}
	const remoteProbe = spawnSync(
		process.execPath,
		[
			'-e',
			`import { resolveMowaDbEnv, VALIDATE_DB_RE } from ${JSON.stringify(join(root, 'scripts/lib/local-db-guard.mjs'))}; resolveMowaDbEnv({ MOWA_DB_HOST:'db.x.supabase.co', MOWA_DB_NAME:'mowa_local' }, { dbNameRe: VALIDATE_DB_RE, label: 'probe' });`
		],
		{ encoding: 'utf8' }
	);
	if (remoteProbe.status === 0) {
		console.error('expected local-db-guard to refuse non-loopback host');
		process.exit(1);
	}
	const remoteHttp = spawnSync(
		process.execPath,
		[
			'-e',
			`import { assertLoopbackHttpUrl } from ${JSON.stringify(join(root, 'scripts/lib/local-db-guard.mjs'))}; assertLoopbackHttpUrl('https://db.x.supabase.co');`
		],
		{ encoding: 'utf8' }
	);
	if (remoteHttp.status === 0) {
		console.error('expected assertLoopbackHttpUrl to refuse non-loopback host');
		process.exit(1);
	}
	console.log('guard ok: DATABASE_URL ignored; remote DB/PostgREST hosts refused');
}

console.log('resetting local stack (migrations only; GATED stays .sql.txt)…');
{
	const childEnv = { ...process.env, ...mowaEnv };
	delete childEnv.DATABASE_URL;
	const r = spawnSync(process.execPath, [join(root, 'scripts/local-stack-up.mjs')], {
		cwd: root,
		encoding: 'utf8',
		env: childEnv
	});
	if (r.status !== 0) {
		console.error(r.stdout);
		console.error(r.stderr);
		process.exit(1);
	}
	for (const line of (r.stdout || '').split('\n')) {
		if (line.startsWith('apply ')) console.log('draft ok ', line.slice(6));
	}
}

const pool = new pg.Pool({
	host: dbTarget.host,
	port: Number(dbTarget.port),
	user: dbTarget.user,
	password: dbTarget.password,
	database: dbTarget.dbName
});
const db = {
	query: (text, params) => pool.query(text, params),
	exec: async (sql) => {
		const env = { ...process.env, PGPASSWORD: dbTarget.password };
		delete env.DATABASE_URL;
		const r = spawnSync(
			'psql',
			['-h', dbTarget.host, '-p', dbTarget.port, '-U', dbTarget.user, '-d', dbTarget.dbName, '-v', 'ON_ERROR_STOP=1', '-c', sql],
			{ encoding: 'utf8', env }
		);
		if (r.status !== 0) {
			const msg = (r.stderr || r.stdout || 'psql failed').trim();
			throw new Error(msg);
		}
		return r;
	}
};

async function run(role, sub, bot, sql) {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query(`select set_config('request.jwt.claims', $1, true)`, [
			JSON.stringify({ role, sub })
		]);
		await client.query(`select set_config('request.headers', $1, true)`, [
			JSON.stringify(bot ? { 'x-mowa-bot-id': bot } : {})
		]);
		await client.query(`set local role ${role}`);
		const result = await client.query(sql);
		await client.query('COMMIT');
		return result;
	} catch (e) {
		try {
			await client.query('ROLLBACK');
		} catch {
			/* ignore */
		}
		throw e;
	} finally {
		client.release();
	}
}

function b64urlJson(obj) {
	return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function signJwt(payload) {
	const h = b64urlJson({ alg: 'HS256', typ: 'JWT' });
	const p = b64urlJson(payload);
	const sig = createHmac('sha256', jwtSecret).update(`${h}.${p}`).digest('base64url');
	return `${h}.${p}.${sig}`;
}

let postgrestProc = null;
function startPostgrest() {
	const conf = join(root, '.local/postgrest.conf');
	spawnSync('pkill', ['-9', '-f', `postgrest ${conf}`], { encoding: 'utf8' });
	// Wait briefly so the prior bind on 54321 is released before re-spawn.
	spawnSync('sleep', ['0.5'], { encoding: 'utf8' });
	postgrestProc = spawn('postgrest', [conf], { stdio: ['ignore', 'pipe', 'pipe'] });
	let stderr = '';
	postgrestProc.stderr.on('data', (buf) => {
		stderr += buf.toString();
	});
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => {
			clearInterval(poll);
			reject(new Error(`PostgREST start timeout\n${stderr.slice(-500)}`));
		}, 15000);
		postgrestProc.on('error', (e) => {
			clearTimeout(t);
			clearInterval(poll);
			reject(e);
		});
		postgrestProc.on('exit', (code) => {
			clearTimeout(t);
			clearInterval(poll);
			reject(new Error(`PostgREST exited early code=${code}\n${stderr.slice(-500)}`));
		});
		const poll = setInterval(async () => {
			try {
				const res = await fetch(postgrestUrl);
				if (res.status === 200 || res.status === 401) {
					clearInterval(poll);
					clearTimeout(t);
					postgrestProc.removeAllListeners('exit');
					resolve();
				}
			} catch {
				/* not up yet */
			}
		}, 150);
	});
}

const U = '11111111-1111-1111-1111-111111111111', X = '22222222-2222-2222-2222-222222222222';
await db.query(`insert into auth.users(id, email) values ('${U}','me@x'),('${X}','other@x')`);
const user = (sql) => run('authenticated', U, null, sql);
const other = (sql) => run('authenticated', X, null, sql);
let FM, EA, HS;
const asBot = (b) => (sql) => run('service_role', null, b, sql);
let pass = 0, fail = 0;
const ok = async (n, fn) => { try { const r = await fn(); pass++; console.log('  ✓', n); return r; } catch (e) { fail++; console.log('  ✗', n, '→', e.message); } };
const err = async (n, fn, re) => { try { await fn(); fail++; console.log('  ✗', n, '(no error)'); } catch (e) { if (re && !re.test(e.message)) { fail++; console.log('  ✗', n, 'wrong:', e.message); } else { pass++; console.log('  ✓', n, '→', e.message.slice(0, 90)); } } };
const eq = (n, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, 'got', a, 'want', b); } };
const H = 'a'.repeat(64);

// bots
FM = (await db.query(`insert into bot_clients(owner_id,name,profile,key_prefix,key_hash,scopes) values ('${U}','finance-manager-boot','finance-manager','fmfmfmfm01','${H}','{read,positions:propose,principles:propose,reports:equity_analysis}') returning id`)).rows[0].id;
EA = (await db.query(`insert into bot_clients(owner_id,name,profile,key_prefix,key_hash,scopes) values ('${U}','equity-analyst-boot','equity-analyst','eaeaeaea01','${'b'.repeat(64)}','{read}') returning id`)).rows[0].id;
HS = (await db.query(`insert into bot_clients(owner_id,name,profile,key_prefix,key_hash,scopes) values ('${U}','house-signal-boot','house-signal','hshshshs01','${'c'.repeat(64)}','{read}') returning id`)).rows[0].id;
const fm = asBot(FM), ea = asBot(EA);
console.log('\n[권한·승인 큐]');
await err('PM확정: positions:propose 스코프는 finance-manager 프로필만', () => db.query(`update bot_clients set scopes='{read,positions:propose}' where id='${EA}'`), /propose_only_fm/);
const inst = (await ok('user inserts instrument KRX 035420', () => user(`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${U}','035420','NAVER','KRX','stock') returning id`))).rows[0].id;
await err('R-VAL-C01 KRX 코드 6자리', () => user(`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${U}','NAVER','x','KRX','stock')`), /krx_code/);
await err('R-VAL-C03 내부 코드 형식', () => user(`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${U}','ust-30y','x','BOND','bond')`), /internal_code/);
const g = (await user(`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${U}','GOOGL','Alphabet','NASDAQ','stock') returning id`)).rows[0].id;
const pos = (await ok('user creates holding (migration-equivalent)', () => user(`insert into positions(owner_id,instrument_id,status,currency,qty,avg_price,breakeven) values ('${U}','${inst}','holding','KRW',27,210000,211000) returning id, version`))).rows[0];
await ok('PM확정 Q-07: 같은 종목 holding + planned 동시 허용', () => fm(`insert into positions(owner_id,instrument_id,status,currency,source_bot_id) values ('${U}','${inst}','planned','KRW','${FM}')`));
await err('R-VAL-P03: 같은 종목 planned 2개는 금지', () => fm(`insert into positions(owner_id,instrument_id,status,currency,source_bot_id) values ('${U}','${inst}','planned','KRW','${FM}')`), /duplicate|unique/);
await err('R-VAL-P01: 봇이 qty 직접 수정', () => fm(`update positions set qty=99 where id='${pos.id}'`), /R-VAL-P01/);
await err('R-PERM-02: 봇이 holding 새 행 생성', () => fm(`insert into positions(owner_id,instrument_id,status,currency,qty,avg_price) values ('${U}','${g}','holding','USD',5,300)`), /R-VAL-P01/);
await ok('R-PERM-17 (Q-13 확정): finance-manager가 planned 행에 trigger_price 직접 기입', () => fm(`insert into positions(owner_id,instrument_id,status,currency,trigger_price) values ('${U}','${g}','planned','USD',270.7)`));
await err('R-VAL-P12: equity-analyst의 positions 쓰기 → 403', () => ea(`update positions set trigger_price=1 where id='${pos.id}'`), /R-VAL-P12/);
await err('R-VAL-M03 (Q-15 확정): 주식 소수 수량은 사용자 직접 쓰기도 ERROR', () => user(`update positions set qty=27.5 where id='${pos.id}'`), /R-VAL-M03/);
await ok('R-PERM 표: 봇이 base_price/base_at/memo 직접 수정', () => fm(`update positions set base_price=205000, base_at='2026-11-20T15:30:00+09:00', memo='종가 기준' where id='${pos.id}'`));
const v1 = (await db.query(`select version from positions where id='${pos.id}'`)).rows[0].version;
eq('base_price 수정은 version 불변(대기 제안 충돌 없음)', v1, 1);
await ok('R-PERM-17: finance-manager가 holding 행 trigger_price·breakeven 직접 수정', () => fm(`update positions set trigger_price=180000, breakeven=212000 where id='${pos.id}'`));
eq('R-PERM-17: version은 +1, approval_version은 그대로(대기 제안 conflict 안 됨)', (await db.query(`select version, approval_version from positions where id='${pos.id}'`)).rows[0], { version: 2, approval_version: 1 });
eq('R-PERM-17: 감사 로그에 이전/새 값', (await db.query(`select args_preview->'before'->>'trigger_price' b, (args_preview->'after'->>'trigger_price')::numeric::int a, actor_type from mcp_audit_log where tool='positions.trigger_breakeven' order by id desc limit 1`)).rows[0], { b: null, a: 180000, actor_type: 'bot' });
await err('R-PERM-01: 봇이 positions 삭제', () => fm(`delete from positions where id='${pos.id}'`), /R-PERM-01/);
await err('R-PERM-03: 봇 신원 헤더 없음', () => run('service_role', null, null, `update positions set memo='x' where id='${pos.id}'`), /R-PERM-03/);
await err('R-VAL-P07: 근거 없는 제안', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":32}','[]')`), /evidence/);
await err('R-VAL-P07: 현재값과 같은 제안', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":27}','[{"label":"x"}]')`), /R-VAL-P07/);
await err('R-PERM-13: change_type 허용 밖 필드', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"owner_id":"${X}"}','[{"label":"x"}]')`), /not allowed/);
const p1 = (await ok('finance-manager 제안 생성(pending, current_values 서버 채움)', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence,proposed_by) values ('${U}','set_qty_avg','${pos.id}','{"qty":32,"avg_price":208500}','[{"label":"사용자 체결 통지 11/20 16:05"}]','${EA}') returning id, proposed_by, current_values, status`))).rows[0];
eq('R-PERM-03: proposed_by는 봇이 보낸 값 무시하고 서버가 채움', p1.proposed_by, FM);
eq('current_values.qty = 승인값 27', Number(p1.current_values.qty), 27);
const p2 = (await fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":33}','[{"label":"정정"}]') returning id`)).rows[0].id;
eq('R-PERM-13: 같은 대상 새 제안 → 이전 pending superseded', (await db.query(`select status from position_proposals where id='${p1.id}'`)).rows[0].status, 'superseded');
eq('R-PERM-13: 승인 전 positions 값 불변', Number((await db.query(`select qty from positions where id='${pos.id}'`)).rows[0].qty), 27);
await err('R-PERM-05: 봇이 approve 호출', () => fm(`select approve_proposal('${p2}')`), /permission denied|R-PERM-05/);
await err('R-PERM-05: 봇이 상태를 approved로 위조', () => fm(`update position_proposals set status='approved' where id='${p2}'`), /R-PERM-05/);
await err('R-PERM-01: 다른 봇이 제안 취소', () => ea(`update position_proposals set status='cancelled' where id='${p2}'`), /own|cancel|R-PERM/);
await err('타 사용자 승인 불가', () => other(`select approve_proposal('${p2}')`), /not found/);
await err('사용자도 제안 행 직접 수정 불가', () => user(`update position_proposals set status='approved' where id='${p2}'`), /permission denied/);
await err('R-VAL-M03/Q-15: 소수 수량 override 거부(기본)', () => user(`select approve_proposal('${p2}', '{"qty":33.5}')`), /R-VAL-M03/);
eq('사용자 승인(+평단 수정) → approved', (await user(`select status from approve_proposal('${p2}', '{"avg_price":208400}', 'ok')`)).rows[0].status, 'approved');
const after = (await db.query(`select qty, avg_price, version from positions where id='${pos.id}'`)).rows[0];
eq('승인 후 반영 qty=33 avg=208400 version=3', [Number(after.qty), Number(after.avg_price), after.version], [33, 208400, 3]);
const p3 = (await fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":40}','[{"label":"사용자 결정 11/03"}]') returning id`)).rows[0].id;
await user(`update positions set qty=34 where id='${pos.id}'`);
eq('사용자 직접 수정 후 이전 제안 승인 → conflict', (await user(`select status from approve_proposal('${p3}')`)).rows[0].status, 'conflict');
const p4 = (await ok('open_holding 제안(instrument_id 기준 신규 보유)', () => fm(`insert into position_proposals(owner_id,change_type,instrument_id,proposed_values,evidence) values ('${U}','open_holding','${g}','{"qty":5,"avg_price":295.04,"currency":"USD"}','[{"label":"10/29 사용자 5주 매수 통지"}]') returning id`))).rows[0].id;
await ok('open_holding 승인 → holding 행 생성', () => user(`select approve_proposal('${p4}')`));
eq('GOOGL holding USD 5주', (await db.query(`select status,currency,qty::int q from positions where instrument_id='${g}' and status='holding'`)).rows[0], { status: 'holding', currency: 'USD', q: 5 });
await err('R-VAL-P07 (Q-13 확정): set_trigger 제안 유형 거부', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_trigger','${pos.id}','{"trigger_price":170000}','[{"label":"x"}]')`), /R-VAL-P07/);
await err('R-VAL-M03: 제안 단계에서도 주식 소수 수량 거부', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":35.5}','[{"label":"x"}]')`), /R-VAL-M03/);
await err('R-VAL-P10: 없는 report_id 근거 거부', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":36}','[{"report_id":"${X}"}]')`), /R-VAL-P10/);
await err('R-VAL-P09: calc_note 개행·200자 초과 거부', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence,calc_note) values ('${U}','set_qty_avg','${pos.id}','{"qty":36}','[{"label":"x"}]','${'가'.repeat(201)}')`), /calc_note/);
console.log('\n[G-1 on_hold · G-4 사용자 제안 · G-7 표시 ID]');
const h1 = (await ok('finance-manager 제안 + calc_note(G-7)', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence,calc_note) values ('${U}','set_qty_avg','${pos.id}','{"qty":36}','[{"label":"체결 통지"}]','평단 = (34×208400 + 2×161600) ÷ 36') returning id, display_no`))).rows[0];
eq('표시 ID: 서버가 insert 때 발급한 문자열 = P- + 4자리', (await db.query(`select display_id = 'P-' || lpad(display_no::text,4,'0') ok from position_proposals where id='${h1.id}'`)).rows[0].ok, true);
eq('표시 ID 포맷: 4자리 0채움, 10000부터 자릿수 증가(lpad 잘림 없음)', (await db.query(`select mowa_display_id('P',412) a, mowa_display_id('P',10000) b, mowa_display_id('R',1) c`)).rows[0], { a: 'P-0412', b: 'P-10000', c: 'R-0001' });
await err('표시 ID 불변(update 거부)', () => db.query(`update position_proposals set display_no=999 where id='${h1.id}'`), /DISPLAY-ID|generated/);
await err('display_sequences는 사용자·봇 직접 접근 불가', () => user(`select * from display_sequences`), /permission denied/);
await err('display_sequences는 봇도 직접 접근 불가', () => fm(`update display_sequences set next_no=1`), /permission denied/);
await err('G-1: 봇은 on_hold 설정 불가', () => fm(`update position_proposals set status='on_hold' where id='${h1.id}'`), /R-PERM-05/);
eq('G-1: 사용자 보류 → on_hold', (await user(`select status from hold_proposal('${h1.id}', true)`)).rows[0].status, 'on_hold');
await db.exec(`update position_proposals set expires_at = now() - interval '1 day' where id='${h1.id}'`);
await db.query(`select expire_stale_proposals()`);
eq('G-1: on_hold는 만료 제외', (await db.query(`select status from position_proposals where id='${h1.id}'`)).rows[0].status, 'on_hold');
await err('Q-29 사용자는 봇 제안을 철회(cancel) 못 함 → 거절만', () => user(`select cancel_own_proposal('${h1.id}')`), /R-PERM-05/);
await err('Q-29 다른 봇은 on_hold 제안 취소 불가', () => ea(`update position_proposals set status='cancelled' where id='${h1.id}'`), /R-PERM/);
eq('G-1: 보류 해제 → pending, 만료 재계산', (await user(`select status, expires_at > now() as fresh from hold_proposal('${h1.id}', false)`)).rows[0], { status: 'pending', fresh: true });
await user(`select hold_proposal('${h1.id}', true)`);
eq('G-1: on_hold에서 바로 거절 가능', (await user(`select status from reject_proposal('${h1.id}', '체결 안 됨')`)).rows[0].status, 'rejected');
const sg = (await user(`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${U}','SGOV','iShares 0-3M Treasury','NYSEARCA','etf') returning id`)).rows[0].id;
const sgp = (await user(`insert into positions(owner_id,instrument_id,status,currency,qty,source_ref) values ('${U}','${sg}','holding','USD',10,'{"migration":"avg_price_pending_Q-21"}') returning id`)).rows[0].id;
await err('PM 2026-11-21: 사용자 정정은 직접 insert 불가(큐에 pending으로 쌓지 않음)', () => user(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${sgp}','{"avg_price":100}','[{"user_statement":"x"}]')`), /permission denied|R-VAL-P11/);
const up = (await ok('G-4/R-VAL-P11: 사용자 정정(Q-21 SGOV USD 평단) → 한 번에 생성·승인·반영', () => user(`select * from apply_user_correction('${sgp}', 10, 'USD', 100.42, 'SGOV 평단 $100.42 (증권사 앱 확인)')`))).rows[0];
eq('사용자 정정: status=approved, proposed_by_type=user, 봇 신원 없음', [up.status, up.proposed_by, up.proposed_by_type, up.proposed_by_user], ['approved', null, 'user', U]);
eq('SGOV avg_price USD 반영', Number((await db.query(`select avg_price from positions where id='${sgp}'`)).rows[0].avg_price), 100.42);
eq('사용자 정정 감사 로그 before/after', (await db.query(`select args_preview->'after'->>'avg_price' a from mcp_audit_log where tool='proposal.user_correction' order by created_at desc limit 1`)).rows[0].a, '100.42');
await err('사용자 정정: 화면이 본 approval_version과 다르면 CONFLICT', () => user(`select apply_user_correction('${sgp}', 11, 'USD', 100.5, '재확인', null, 1)`), /CONFLICT/);
await err('사용자 정정: 사유는 한 줄', () => user(`select apply_user_correction('${sgp}', 11, 'USD', 100.5, E'a\nb')`), /one line/);
await err('사용자 정정: ETF 소수 수량 → R-VAL-M03', () => user(`select apply_user_correction('${sgp}', 10.5, 'USD', 100.5, '분할')`), /R-VAL-M03/);
await err('봇은 apply_user_correction 실행 불가(R-VAL-P11)', () => fm(`select apply_user_correction('${sgp}', 11, 'USD', 100.5, 'x')`), /permission denied/);
await err('다른 사용자는 남의 포지션 정정 불가', () => other(`select apply_user_correction('${sgp}', 11, 'USD', 100.5, 'x')`), /not found/);
await err('PM: 사용자 정정 사유 121자 → ERROR', () => user(`select apply_user_correction('${sgp}', 12, 'USD', 100.5, '${'가'.repeat(121)}')`), /1-120 chars/);
await ok('PM: 사용자 정정 사유 120자 → 통과', () => user(`select apply_user_correction('${sgp}', 12, 'USD', 100.5, '${'가'.repeat(120)}')`));
await err('사용자는 다른 사람 명의 제안 불가', () => other(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${sgp}','{"qty":11}','[{"label":"x"}]')`), /permission denied|row-level security|owner mismatch|not found/);

const h2 = (await fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":31}','[{"url":"https://q29"}]') returning id`)).rows[0].id;
await user(`select hold_proposal('${h2}', true)`);
eq('Q-29 제안한 봇은 자기 on_hold 제안을 cancelled로', (await fm(`update position_proposals set status='cancelled' where id='${h2}' returning status`)).rows[0].status, 'cancelled');
await err('Q-29 사용자 정정 행(approved)은 철회 대상 아님', () => user(`select cancel_own_proposal('${up.id}')`), /already approved/);
await err('Q-29 봇은 사용자 제안 취소 불가', () => fm(`update position_proposals set status='cancelled' where id='${up.id}'`), /R-PERM|proposal/);
await err('Q-32 watch_only=true면 trigger_price 금지', () => fm(`update positions set watch_only=true, trigger_price=300000 where id='${pos.id}'`), /watch_only/);
const hy = (await user(`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${U}','005380','현대차','KRX','stock') returning id`)).rows[0].id;
const hyp = (await ok('Q-32 현대차 이전: watch_only=true, trigger_price=null, status 그대로', () => user(`insert into positions(owner_id,instrument_id,status,currency,qty,avg_price,watch_only,trigger_price) values ('${U}','${hy}','holding','KRW',3,250000,true,null) returning id`))).rows[0].id;
await fm(`update positions set watch_only=false where id='${hyp}'`);
eq('Q-32 watch_only 변경도 감사 로그 before/after', (await db.query(`select args_preview->'before'->>'watch_only' b, args_preview->'after'->>'watch_only' a from mcp_audit_log where tool='positions.trigger_breakeven' and affected_ids @> '[{"id":"${hyp}"}]' order by created_at desc limit 1`)).rows[0], { b: 'true', a: 'false' });
const cash = (await user(`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${U}','CASH_USD','달러 현금','OTHER','cash') returning id`)).rows[0].id;
await ok('Q-31 cash 수량 소수 2자리 허용', () => user(`insert into positions(owner_id,instrument_id,status,currency,qty) values ('${U}','${cash}','holding','USD',1234.56)`));
await err('Q-31 cash 수량 소수 3자리 → ERROR', () => user(`update positions set qty=1234.567 where instrument_id='${cash}'`), /R-VAL-M03/);
await err('R-VAL-M03 주식 소수 수량(사용자도) → ERROR', () => user(`update positions set qty=3.5 where id='${hyp}'`), /R-VAL-M03/);
await ok('Q-16 review는 instrument 없이 tickers[] 다종목', () => fm(`insert into journal_entries(owner_id,entry_date,kind,title,tickers,source_bot_id) values ('${U}','2026-11-21','review','주간 점검','{035420,GOOGL}','${FM}')`));
await err('Q-16/R-VAL-C04 tickers[]에 없는 코드', () => fm(`insert into journal_entries(owner_id,entry_date,kind,title,tickers,source_bot_id) values ('${U}','2026-11-21','thought','x','{NAVER}','${FM}')`), /R-VAL-C04/);
await err('Q-16 buy/sell은 instrument_id 필수', () => fm(`insert into journal_entries(owner_id,entry_date,kind,title,price,qty,currency,tickers,source_bot_id) values ('${U}','2026-11-21','buy','x',1,1,'KRW','{035420}','${FM}')`), /journal_trade_needs_instrument/);
await err('Q-22 daily_brief는 domain=macro', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,tickers,source_bot_id) values ('${U}','daily_brief','stock','daily','x','2026-11-10','x','{035420}','${FM}')`), /reports_domain_macro_brief/);
await err('Q-22 equity_analysis는 domain=stock', () => ea(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,source_bot_id) values ('${U}','equity_analysis','macro','naver','x','2026-11-10','x','${EA}')`), /reports_domain_stock_analysis/);
await err('Q-14 KRX 영숫자 코드는 아직 거부(^\\d{6}$)', () => user(`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${U}','0050A0','x','KRX','etf')`), /instruments_krx_code/);

await err('R-VAL-R15 alignment 허용값 밖 → ERROR', () => ea(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,meta,source_bot_id) values ('${U}','equity_analysis','stock','naver-ctx','x','2026-11-10','x','{"alignment":"bullish"}','${EA}')`), /reports_meta_alignment/);
await err('R-VAL-R15 equity_analysis 외 kind에 alignment 금지', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,meta,source_bot_id) values ('${U}','daily_brief','macro','daily','x','2026-11-09','x','{"alignment":"aligned"}','${FM}')`), /reports_meta_alignment/);
await err('R-VAL-P13 다른 봇의 watch_only 쓰기 → 403', () => ea(`update positions set watch_only=true where id='${hyp}'`), /R-VAL-P12|R-PERM-04/);

console.log('\n[리포트]');
const rep = (await ok('R-CLS-03 봇 upsert daily_brief + headline', () => fm(`insert into reports(owner_id,kind,domain,slug,title,headline,report_date,summary,body_md,source_bot_id) values ('${U}','daily_brief','macro','daily','데일리 브리핑 11/20','코스피 −5.21% 검은 금요일','2026-11-20','a\nb\nc','# v1 투자 권유 아님','${FM}') returning id`))).rows[0].id;
await fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,source_bot_id) values ('${U}','daily_brief','macro','daily','데일리 브리핑 11/20','2026-11-20','# v2','${FM}') on conflict (owner_id,kind,report_date,slug) do update set body_md=excluded.body_md`);
eq('R-CLS-03 같은 키 두 번 → version 2, revision 1', (await db.query(`select r.version v,(select count(*)::int from report_revisions where report_id=r.id) n from reports r where id='${rep}'`)).rows[0], { v: 2, n: 1 });
await err('R-VAL-R01 intraday 비활성(PM 확정)', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,source_bot_id) values ('${U}','intraday','stock','x','x','2026-11-20','x','${FM}')`), /check/);
await err('R-VAL-R02 domain·kind 불일치', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,source_bot_id) values ('${U}','realestate_brief','stock','daily','x','2026-11-20','x','${FM}')`), /domain_matches_kind/);
await err('R-VAL-T05 주간 리포트 기간·일요일', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,period_start,period_end,body_md,source_bot_id) values ('${U}','weekly_report','macro','weekly','x','2026-11-14','2026-11-08','2026-11-14','x','${FM}')`), /weekly_period/);
await ok('R-VAL-T05 정상 주간(11/09~11/15 일)', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,period_start,period_end,body_md,source_bot_id) values ('${U}','weekly_report','macro','weekly','주간 46주차','2026-11-15','2026-11-09','2026-11-15','x','${FM}')`));
await err('R-VAL-R04 summary 4줄', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,summary,body_md,source_bot_id) values ('${U}','daily_brief','macro','daily','x','2026-11-19','a\nb\nc\nd','x','${FM}')`), /summary/);
await err('headline은 한 줄(개행 금지)', () => fm(`insert into reports(owner_id,kind,domain,slug,title,headline,report_date,body_md,source_bot_id) values ('${U}','daily_brief','macro','daily','x','a\nb','2026-11-18','x','${FM}')`), /headline/);
await err('R-VAL-S06 slug 형식', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,source_bot_id) values ('${U}','daily_brief','macro','Daily_1','x','2026-11-17','x','${FM}')`), /slug/);
await err('PM확정 buy_plan: 봇은 draft만', () => ea(`insert into reports(owner_id,kind,subtype,domain,slug,title,report_date,body_md,status,source_bot_id) values ('${U}','equity_analysis','buy_plan','stock','robotis-plan','계획서','2026-11-20','x','published','${EA}')`), /buy_plan/);
await ok('buy_plan draft 작성(equity_analysis/subtype=buy_plan)', () => ea(`insert into reports(owner_id,kind,subtype,domain,slug,title,report_date,body_md,status,source_bot_id) values ('${U}','equity_analysis','buy_plan','stock','robotis-plan','계획서','2026-11-20','x','draft','${EA}')`));
await err('subtype=buy_plan은 equity_analysis에만', () => fm(`insert into reports(owner_id,kind,subtype,domain,slug,title,report_date,body_md,source_bot_id) values ('${U}','daily_brief','buy_plan','macro','daily','x','2026-11-16','x','${FM}')`), /subtype/);
await err('R-PERM-01 다른 봇 리포트 수정·보관 불가', () => ea(`update reports set archived_at=now() where id='${rep}'`), /R-PERM-01/);
await ok('R-PERM-01 자기 리포트 보관', () => fm(`update reports set archived_at=now() where id='${rep}'`));
await err('R-SYS-03 봇은 보관 해제(복원) 불가', () => fm(`update reports set archived_at=null where id='${rep}'`), /restored by the user/);
await ok('R-SYS-03 사용자는 복원 가능', () => user(`update reports set archived_at=null where id='${rep}'`));
await err('PM확정 Q-01: 사용자도 영구 삭제 불가', () => user(`delete from reports where id='${rep}'`), /permission denied/);
await err('R-PERM 표 D8: 봇은 principles 쓰기 금지', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,source_bot_id) values ('${U}','principles','stock','main','원칙','2026-10-12','x','${FM}')`), /principles/);
const urep = (await user(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md) values ('${U}','principles','stock','main','나의 매매 원칙','2026-10-12','...') returning id`)).rows[0].id;
await err('R-CLS-05/R-PERM-16 사용자 작성 리포트 내용은 봇이 수정 불가(CONFLICT)', () => fm(`update reports set body_md='x' where id='${urep}'`), /R-PERM-16/);
await err('R-PERM-01 사용자 작성 리포트 보관 불가', () => fm(`update reports set archived_at=now() where id='${urep}'`), /R-PERM-01/);
console.log('\n[R-PERM-16 같은 키 · Q-28 만료 설정 · R-PERM-15 원칙 제안]');
await ok('Q-02 finance-manager equity_analysis 작성', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,source_bot_id) values ('${U}','equity_analysis','stock','naver-deep','NAVER 심층','2026-10-08','x','${FM}')`));
await err('R-PERM-16/R-VAL-R11 다른 봇이 같은 키 upsert → CONFLICT', () => ea(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,source_bot_id) values ('${U}','equity_analysis','stock','naver-deep','덮어쓰기','2026-10-08','y','${EA}') on conflict (owner_id,kind,report_date,slug) do update set body_md=excluded.body_md`), /R-PERM-16.*CONFLICT/);
await ok('R-PERM-16 같은 봇 재작성은 허용(version+1)', () => fm(`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md,source_bot_id) values ('${U}','equity_analysis','stock','naver-deep','NAVER 심층','2026-10-08','x2','${FM}') on conflict (owner_id,kind,report_date,slug) do update set body_md=excluded.body_md`));
const pexp = async () => (await user(`select round(extract(epoch from (expires_at - created_at))/86400)::int d from position_proposals order by created_at desc limit 1`)).rows[0].d;
eq('Q-28 기본 만료 7일(서버가 채움)', await pexp(), 7);
await user(`insert into app_settings(owner_id,key,value) values ('${U}','proposal_expiry_days','14') on conflict (owner_id,key) do update set value=excluded.value`);
const pp1 = (await ok('principle_proposals: finance-manager 원칙 개정 제안(pending)', () => fm(`insert into principle_proposals(owner_id,principle_id,clause_ref,proposed_body_md,reason_md,evidence,proposed_by_type,proposed_by_user,status) values ('${U}','${urep}','3-2 손절','# 원칙\n손절 -8%','변동성 확대','[{"user_statement":"손절선 낮추자","stated_at":"2026-11-20T21:00:00+09:00"}]','user','${U}','pending') returning id, proposed_by_type, proposed_by, proposed_by_user, base_version, length(base_body_hash) h, display_no, round(extract(epoch from (expires_at-created_at))/86400)::int d`))).rows[0];
eq('R-PERM-03 봇이 user를 사칭해도 서버가 bot·FM으로 고정 · base_version·본문 해시 · Q-28 설정 14일', [pp1.proposed_by_type, pp1.proposed_by === FM, pp1.proposed_by_user, pp1.base_version, pp1.h, pp1.d], ['bot', true, null, 1, 64, 14]);
await err('R-PERM-15 원칙 제안은 position_proposals에 못 넣음', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','amend_clause','${pos.id}','{}','[{}]')`), /R-PERM-15/);
await err('D8 equity-analyst는 원칙 제안 불가', () => ea(`insert into principle_proposals(owner_id,principle_id,proposed_body_md,reason_md,evidence) values ('${U}','${urep}','x','y','[{"url":"https://x"}]')`), /R-PERM-04/);
await err('R-PERM-15 대상은 principles 리포트만', () => fm(`insert into principle_proposals(owner_id,principle_id,proposed_body_md,reason_md,evidence) values ('${U}','${rep}','x','y','[{"url":"https://x"}]')`), /R-PERM-15/);
await err('근거 없는 원칙 제안', () => fm(`insert into principle_proposals(owner_id,principle_id,proposed_body_md,reason_md,evidence) values ('${U}','${urep}','x','y','[]')`), /check/);
await err('R-VAL-P10 원칙 제안의 없는 report_id 근거', () => fm(`insert into principle_proposals(owner_id,principle_id,proposed_body_md,reason_md,evidence) values ('${U}','${urep}','x','y','[{"report_id":"${X}"}]')`), /R-VAL-P10/);
await err('R-PERM-05 봇이 원칙 제안 승인', () => fm(`select approve_principle_proposal('${pp1.id}')`), /permission denied/);
await err('R-PERM-01 다른 봇이 원칙 제안 취소', () => ea(`update principle_proposals set status='cancelled' where id='${pp1.id}'`), /R-PERM|own|cancel/);
await err('Q-01 사용자도 원칙 제안 삭제 불가', () => user(`delete from principle_proposals where id='${pp1.id}'`), /permission denied/);
eq('G-1 원칙 제안도 보류 가능(on_hold)', (await user(`select status from decide_principle_proposal('${pp1.id}','hold')`)).rows[0].status, 'on_hold');
const pp2 = (await ok('사용자 작성 원칙 제안(웹 세션)', () => user(`insert into principle_proposals(owner_id,principle_id,proposed_body_md,reason_md,evidence) values ('${U}','${urep}','# 원칙 v2\n손절 -9%','재검토','[{"user_statement":"-9%로","stated_at":"2026-11-21T11:00:00+09:00"}]') returning id, proposed_by_type`))).rows[0];
eq('on_hold에도 superseded 적용 + superseded_by', (await user(`select status, superseded_by from principle_proposals where id='${pp1.id}'`)).rows[0], { status: 'superseded', superseded_by: pp2.id });
const ap2 = (await user(`select status, applied_report_id, base_version from approve_principle_proposal('${pp2.id}')`)).rows[0];
eq('사용자 원칙 제안 승인 → approved + 새 principles 행(사용자 작성)', (await user(`select 'approved' as status, r.kind, r.source_bot_id is null as by_user, r.body_md from reports r where r.id='${ap2.applied_report_id}'`)).rows[0], { status: 'approved', kind: 'principles', by_user: true, body_md: '# 원칙 v2\n손절 -9%' });
const pp3 = (await fm(`insert into principle_proposals(owner_id,principle_id,proposed_body_md,reason_md,evidence) values ('${U}','${urep}','새 조항','추가','[{"url":"https://y"}]') returning id`)).rows[0].id;
await user(`select decide_principle_proposal('${pp3}','hold')`);
await user(`update reports set body_md='사용자 재수정' where id='${urep}'`);
eq('R-PERM-13 conflict(on_hold에도): 대상이 바뀐 뒤 승인 → conflict', (await user(`select status from approve_principle_proposal('${pp3}')`)).rows[0].status, 'conflict');
await err('Q-25: finance-manager의 targets_valuation 쓰기 → 403', () => fm(`insert into targets_valuation(owner_id,instrument_id,as_of,target_price,currency,opinion,source,report_id) values ('${U}','${inst}','2026-11-20',200000,'KRW','buy','internal','${rep}')`), /R-PERM-04/);
// PM 결정 2026-11-21: '확인 필요' 그룹 · trigger_direction · 원칙 제안 취소 규칙
await err('원칙: 사용자는 봇 제안을 cancel 못 함(R-VAL-P14)', () => user(`select decide_principle_proposal('${pp3}','cancel')`), /R-PERM-05|not found/);
eq('원칙 conflict 확인(ack): 상태 유지 + acknowledged_at', (await user(`select status, acknowledged_at is not null as ack, acknowledged_by = '${U}' as by_user from decide_principle_proposal('${pp3}','ack')`)).rows[0], { status: 'conflict', ack: true, by_user: true });
const ppu = (await user(`insert into principle_proposals(owner_id,principle_id,proposed_body_md,reason_md,evidence) values ('${U}',(select id from reports where kind='principles' and archived_at is null order by version desc, report_date desc limit 1),'# 사용자안','메모','[{"user_statement":"x"}]') returning id`)).rows[0].id;
eq('원칙: 사용자는 자기 제안 cancel', (await user(`select status from decide_principle_proposal('${ppu}','cancel')`)).rows[0].status, 'cancelled');
const cf = (await db.query(`select id from position_proposals where status='conflict' limit 1`)).rows[0];
if (cf) {
  await err('봇은 확인(ack) 필드를 쓸 수 없음', () => fm(`update position_proposals set acknowledged_at=now() where id='${cf.id}'`), /R-PERM-05|permission/);
  eq('attention_started_at은 conflict 진입 시 자동 기록', (await db.query(`select attention_started_at is not null as s from position_proposals where id='${cf.id}'`)).rows[0].s, true);
  eq('확인 필요 그룹 포함(ack 전)', (await user(`select count(*)::int c from position_proposals where id='${cf.id}' and status in ('conflict','expired') and acknowledged_at is null and attention_started_at > now() - interval '14 days'`)).rows[0].c, 1);
  eq('acknowledge_proposal: 상태 유지 + 그룹에서 빠짐', (await user(`select status, acknowledged_at is not null as ack from acknowledge_proposal('${cf.id}')`)).rows[0], { status: 'conflict', ack: true });
  await db.query(`update position_proposals set acknowledged_at=null, acknowledged_by=null, attention_started_at=now()-interval '15 days', decided_at=now() where id='${cf.id}'`);
  eq('14일 지나면 그룹에서 빠지고 행은 이력에 남음', (await user(`select count(*) filter (where status in ('conflict','expired') and acknowledged_at is null and attention_started_at > now() - interval '14 days')::int g, max(status) st, count(*)::int h from position_proposals where id='${cf.id}'`)).rows[0], { g: 0, st: 'conflict', h: 1 });
} else { fail++; console.log('  ✗ conflict 행 없음(테스트 전제)'); }
const dn = (await db.query(`select (select coalesce(max(display_no),0)::int from position_proposals where owner_id='${U}') pmax, (select count(distinct display_no)::int = count(*)::int from position_proposals where owner_id='${U}') uniq, (select next_no::int from display_sequences where owner_id='${U}' and scope='position_proposal') nxt, (select string_agg(display_id, ',' order by display_no) from principle_proposals where owner_id='${U}') rids`)).rows[0];
eq('취소·거절·만료 뒤에도 번호 재사용 없음(카운터 = 최대값+1, 중복 없음)', [dn.uniq, dn.nxt === dn.pmax + 1], [true, true]);
eq('원칙 제안은 별도 카운터 R-0001부터', dn.rids.split(',')[0], 'R-0001');
eq('owner 단위 카운터: 다른 사용자는 1부터, scope도 따로', (await db.query(`select mowa_next_display_no('${X}','position_proposal')::int a, mowa_next_display_no('${X}','position_proposal')::int b, mowa_next_display_no('${X}','principle_proposal')::int c`)).rows[0], { a: 1, b: 2, c: 1 });
eq('R-PERM-18 서버 되돌리기 RPC 없음(revert_proposal 부재)', (await db.query(`select count(*)::int c from pg_proc where proname ilike '%revert%' and pronamespace='public'::regnamespace`)).rows[0].c, 0);
eq('expired·conflict 행은 모두 attention_started_at 보유(경로 무관)', (await db.query(`select count(*)::int c, count(*) filter (where attention_started_at is null)::int n from (select status, attention_started_at from position_proposals union all select status, attention_started_at from principle_proposals) t where status in ('conflict','expired')`)).rows[0].n, 0);
await err('pending 제안은 ack 불가', () => user(`select acknowledge_proposal((select id from position_proposals where status='approved' limit 1))`), /not found/);
eq('trigger_direction 기본 below', (await db.query(`select trigger_direction from positions where id='${pos.id}'`)).rows[0].trigger_direction, 'below');
await fm(`update positions set trigger_price=230000, trigger_direction='above' where id='${pos.id}'`);
eq('trigger_direction 변경 감사 before/after', (await db.query(`select args_preview->'before'->>'trigger_direction' b, args_preview->'after'->>'trigger_direction' a from mcp_audit_log where tool='positions.trigger_breakeven' order by created_at desc limit 1`)).rows[0], { b: 'below', a: 'above' });
await err('R-VAL-P07 제안 values에 trigger_direction → ERROR', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":40,"trigger_direction":"above"}','[{"url":"https://x"}]')`), /R-VAL-P07/);
await err('R-VAL-P07 제안 values에 breakeven → ERROR', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"breakeven":200000}','[{"url":"https://x"}]')`), /R-VAL-P07/);
await err('R-VAL-P07 제안 values에 watch_only → ERROR', () => fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"watch_only":true}','[{"url":"https://x"}]')`), /R-VAL-P07/);
await err('R-VAL-P15 trigger_direction=sideways → ERROR', () => fm(`update positions set trigger_direction='sideways' where id='${pos.id}'`), /trigger_direction/);
await fm(`update positions set memo='메모만' where id='${pos.id}'`);
eq('R-VAL-P15 쓰기에서 생략하면 기존 값 유지', (await db.query(`select trigger_direction from positions where id='${pos.id}'`)).rows[0].trigger_direction, 'above');
await err('trigger_direction 허용값 밖', () => fm(`update positions set trigger_direction='up' where id='${pos.id}'`), /trigger_direction/);
await err('equity-analyst의 trigger_direction 쓰기 → 403', () => ea(`update positions set trigger_direction='below' where id='${pos.id}'`), /R-VAL-P12|R-PERM-04/);
await user(`delete from app_settings where key='proposal_expiry_days'`).catch(() => {});

console.log('\n[매매일지·기타]');
await ok('일지 client_ref 멱등(PM확정 Q-08)', () => fm(`insert into journal_entries(owner_id,entry_date,kind,title,client_ref,source_bot_id) values ('${U}','2026-11-20','review','점검','fm:2026-11-20:review','${FM}')`));
await err('같은 client_ref 재삽입 → unique', () => fm(`insert into journal_entries(owner_id,entry_date,kind,title,client_ref,source_bot_id) values ('${U}','2026-11-20','review','점검','fm:2026-11-20:review','${FM}')`), /unique|duplicate/);
await err('R-VAL-J05 price에는 currency 필수', () => fm(`insert into journal_entries(owner_id,entry_date,kind,title,price,source_bot_id) values ('${U}','2026-11-20','buy','x',100,'${FM}')`).then(()=>{}).catch(e=>{throw e}), /currency|instrument/);
await err('R-PERM-03 source_bot_id 사칭', () => fm(`insert into journal_entries(owner_id,entry_date,kind,title,source_bot_id) values ('${U}','2026-11-20','review','x','${EA}')`), /R-PERM-03/);
await err('R-VAL-I03 미등록 지표 키', () => fm(`insert into market_indicators(owner_id,as_of,key,value) values ('${U}','2026-11-20','btc',1)`), /foreign key/);
await ok('스냅샷 upsert 덮어쓰기 허용(R-VAL-I02)', async () => { for (const c of [250000, 251000]) await fm(`insert into price_snapshots(owner_id,instrument_id,as_of,close,currency) values ('${U}','${inst}','2026-11-20',${c},'KRW') on conflict (instrument_id,as_of) do update set close=excluded.close`); });
await err('R-VAL-I04 targets_valuation report_id 필수', () => ea(`insert into targets_valuation(owner_id,instrument_id,as_of,currency,opinion,source) values ('${U}','${g}','2026-11-20','USD','buy','internal')`), /null value|not-null/);
await err('R-VAL-RE05 청약 날짜 순서', () => asBot(HS)(`insert into re_subscriptions(owner_id,external_id,name,apply_start,apply_end,source_bot_id) values ('${U}','2026-001','x','2026-12-05','2026-12-01','${HS}')`), /date_order/);
await err('R-VAL-M07 좌표 범위', () => asBot(HS)(`insert into re_complexes(owner_id,external_source,external_id,name,sido,lat,lng,source_bot_id) values ('${U}','zigbang','1','x','서울특별시',10,127,'${HS}')`), /lat/);
await ok('re_complexes external_source+external_id(PM확정 Q-09)', () => asBot(HS)(`insert into re_complexes(owner_id,external_source,external_id,name,sido,lat,lng,households,source_bot_id) values ('${U}','zigbang','12345','x단지','경기도',37.4,127.1,800,'${HS}')`));

console.log('\n[PostgREST]');
await startPostgrest();
const anonJwt = signJwt({ role: 'anon', iss: 'mowa-local' });
const serviceJwt = signJwt({ role: 'service_role', iss: 'mowa-local' });
const tables = (
	await db.query(`
    select tablename from pg_tables
     where schemaname='public'
     order by tablename`)
).rows.map((r) => r.tablename);
await ok('anon key denied select on every public table (SQLSTATE 42501)', async () => {
	const allowed = [];
	for (const t of tables) {
		const res = await fetch(`${postgrestUrl}/${t}?select=*&limit=1`, {
			headers: { Authorization: `Bearer ${anonJwt}`, apikey: anonJwt }
		});
		const body = await res.text();
		// L-6: pass only on SQLSTATE 42501 (PostgREST JSON code or message)
		let code = null;
		try {
			code = JSON.parse(body)?.code;
		} catch {
			/* non-json */
		}
		const denied = !res.ok && (code === '42501' || /"code"\s*:\s*"42501"/.test(body));
		if (!denied) allowed.push(`${t}:${res.status}:${code ?? body.slice(0, 40)}`);
	}
	if (allowed.length) throw new Error(`anon select not denied with 42501: ${allowed.join(',')}`);
	return { tables: tables.length };
});
await err(
	'R-PERM-03 PostgREST: service_role without x-mowa-bot-id cannot update positions',
	async () => {
		const res = await fetch(`${postgrestUrl}/positions?id=eq.${pos.id}`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${serviceJwt}`,
				apikey: serviceJwt,
				'Content-Type': 'application/json',
				Prefer: 'return=representation'
			},
			body: JSON.stringify({ memo: 'no-bot-header' })
		});
		const body = await res.text();
		if (res.ok) throw new Error(`expected denial, got ${res.status} ${body.slice(0, 120)}`);
		throw new Error(body || `HTTP ${res.status}`);
	},
	/R-PERM-03|missing bot identity/
);
await ok('PostgREST: service_role + x-mowa-bot-id can patch bot-writable memo', async () => {
	const res = await fetch(`${postgrestUrl}/positions?id=eq.${pos.id}`, {
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${serviceJwt}`,
			apikey: serviceJwt,
			'Content-Type': 'application/json',
			'x-mowa-bot-id': FM,
			Prefer: 'return=representation'
		},
		body: JSON.stringify({ memo: 'via-postgrest-header' })
	});
	const body = await res.text();
	if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
	return JSON.parse(body);
});

console.log('\n[M-2·M-3·L-1 hardening]');
const ownPend = (await fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":30}','[{"url":"https://m2"}]') returning id`)).rows[0].id;
await err('M-2: 봇이 직접 superseded 표시 불가', () => fm(`update position_proposals set status='superseded' where id='${ownPend}'`), /superseded|R-PERM-05/);
await err('M-2: 다른 봇이 cancelled로 위조 불가', () => ea(`update position_proposals set status='cancelled' where id='${ownPend}'`), /cancel|R-PERM|own/);
await err('M-2: 봇 cancelled 시 다른 컬럼 변경 불가', () => fm(`update position_proposals set status='cancelled', calc_note='x' where id='${ownPend}'`), /cancel|R-PERM-05/);
const ownPend2 = (await fm(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":29}','[{"url":"https://m2b"}]') returning id`)).rows[0].id;
eq('M-2: 서버 supersede(새 제안)는 이전 pending을 superseded', (await db.query(`select status from position_proposals where id='${ownPend}'`)).rows[0].status, 'superseded');
eq('M-2: 최신 제안은 pending 유지', (await db.query(`select status from position_proposals where id='${ownPend2}'`)).rows[0].status, 'pending');
await err('M-3: mcp_audit_log TRUNCATE 거부', () => db.query(`truncate public.mcp_audit_log`), /append-only|truncated|R-SYS-05|42501/);
await err('M-3: report_revisions DELETE 거부', () => db.query(`delete from report_revisions`), /append-only|R-SYS-05/);
await db.query(`insert into mowa_backup_log(kind,file_name,sha256,row_counts,verified) values ('legacy_finance_dump','probe.dump','00','{}',false)`);
await err('M-3: mowa_backup_log verified UPDATE 거부', () => db.query(`update mowa_backup_log set verified=true where file_name='probe.dump'`), /append-only|R-SYS-05/);
await err('L-1: authenticated는 다른 owner settings 읽기 불가', () => other(`select public.mowa_setting('${U}','proposal_expiry_days','7'::jsonb)`), /R-PERM-01|another owner/);
await err('authenticated는 bot_clients 직접 insert 불가', () => user(`insert into bot_clients(owner_id,name,profile,key_prefix,key_hash) values ('${U}','web-key','custom','webwebweb1','${H}')`), /permission denied/);

console.log('\n[instrument_id same-owner]');
// instX is created below in M-4; create early fixture here for owner-mismatch tests
const instXEarly = (
	await other(
		`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${X}','NVDA','NVIDIA','NASDAQ','stock') returning id`
	)
).rows[0].id;
await err('other-owner instrument rejected on positions', () => user(`insert into positions(owner_id,instrument_id,status,currency,qty,avg_price) values ('${U}','${instXEarly}','holding','USD',1,100)`), /R-PERM-01|same owner/);
await err('other-owner instrument rejected on price_snapshots', () => fm(`insert into price_snapshots(owner_id,instrument_id,as_of,close,currency) values ('${U}','${instXEarly}','2026-11-22',1,'USD')`), /R-PERM-01|same owner/);
await err('other-owner instrument rejected on journal_entries', () => user(`insert into journal_entries(owner_id,entry_date,kind,title,instrument_id) values ('${U}','2026-11-22','buy','x','${instXEarly}')`), /R-PERM-01|same owner/);
await err('other-owner instrument rejected on decisions', () => user(`insert into decisions(owner_id,title,instrument_id) values ('${U}','x','${instXEarly}')`), /R-PERM-01|same owner/);
await err('other-owner instrument rejected on events', () => user(`insert into events(owner_id,event_date,title,domain,kind,instrument_id) values ('${U}','2026-12-01','x','stock','earn','${instXEarly}')`), /R-PERM-01|same owner/);
await err('other-owner instrument rejected on report_instruments', () => user(`insert into report_instruments(owner_id,report_id,instrument_id) values ('${U}','${rep}','${instXEarly}')`), /R-PERM-01|same owner/);
await err('other-owner instrument rejected on position_proposals', () => fm(`insert into position_proposals(owner_id,change_type,instrument_id,proposed_values,evidence) values ('${U}','open_holding','${instXEarly}','{"qty":1,"avg_price":10,"currency":"USD"}','[{"url":"https://own"}]')`), /R-PERM-01|same owner|instrument/);
const instSame = (
	await user(
		`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${U}','AMD','AMD','NASDAQ','stock') returning id`
	)
).rows[0].id;
await ok('same-owner instrument allowed on positions', () => user(`insert into positions(owner_id,instrument_id,status,currency,qty,avg_price) values ('${U}','${instSame}','holding','USD',2,100) returning id`));
await ok('same-owner instrument allowed on price_snapshots', () => fm(`insert into price_snapshots(owner_id,instrument_id,as_of,close,currency) values ('${U}','${instSame}','2026-11-22',101,'USD')`));
await ok('same-owner instrument allowed on report_instruments', () => user(`insert into report_instruments(owner_id,report_id,instrument_id) values ('${U}','${rep}','${instSame}')`));
await ok('same-owner instrument allowed on journal_entries', () => user(`insert into journal_entries(owner_id,entry_date,kind,title,instrument_id,currency,price) values ('${U}','2026-11-22','buy','amd','${instSame}','USD',100)`));
eq('price_snapshots keeps unique (instrument_id, as_of)', (await db.query(`select indexdef from pg_indexes where schemaname='public' and tablename='price_snapshots' and indexdef ilike '%(instrument_id, as_of)%'`)).rows.length >= 1, true);

console.log('\n[M-4 tenant · revoked/expired · CASCADE · TRUNCATE]');
const FMX = (
	await db.query(
		`insert into bot_clients(owner_id,name,profile,key_prefix,key_hash,scopes) values ('${X}','fm-x','finance-manager','fmxfmxfmx1','${'e'.repeat(64)}','{read,positions:propose,principles:propose}') returning id`
	)
).rows[0].id;
const FM_REV = (
	await db.query(
		`insert into bot_clients(owner_id,name,profile,key_prefix,key_hash,scopes) values ('${U}','fm-revoked','finance-manager','fmrevoked1','${'f'.repeat(64)}','{read,positions:propose,principles:propose}') returning id`
	)
).rows[0].id;
await db.query(`update bot_clients set revoked_at=now(), revoked_reason='m4' where id='${FM_REV}'`);
const FM_EXP = (
	await db.query(
		`insert into bot_clients(owner_id,name,profile,key_prefix,key_hash,scopes,expires_at) values ('${U}','fm-expired','finance-manager','fmexpired1','${'0'.repeat(64)}','{read,positions:propose,principles:propose}', now() - interval '1 day') returning id`
	)
).rows[0].id;
const fmRev = asBot(FM_REV);
const fmExp = asBot(FM_EXP);
const instX = (
	await other(
		`insert into instruments(owner_id,ticker,name,market,asset_type) values ('${X}','TSLA','Tesla','NASDAQ','stock') returning id`
	)
).rows[0].id;
const posX = (
	await other(
		`insert into positions(owner_id,instrument_id,status,currency,qty,avg_price) values ('${X}','${instX}','holding','USD',1,100) returning id`
	)
).rows[0].id;
await err('M-4: revoked U bot cannot modify X positions', () => fmRev(`update positions set memo='x' where id='${posX}'`), /R-PERM-03/);
await ok('M-4: X finance-manager can update own X position memo', () => asBot(FMX)(`update positions set memo='own-x' where id='${posX}'`));
await err('M-4: expired bot cannot write U positions', () => fmExp(`insert into positions(owner_id,instrument_id,status,currency) values ('${U}','${g}','planned','USD')`), /R-PERM-03/);
await err('M-4: U bot cannot insert into X instruments', () => fm(`insert into instruments(owner_id,ticker,name,market,asset_type,source_bot_id) values ('${X}','MSFT','Microsoft','NASDAQ','stock','${FM}')`), /R-PERM-03/);
await err('M-4: U bot cannot insert into X price_snapshots', () => fm(`insert into price_snapshots(owner_id,instrument_id,as_of,close,currency) values ('${X}','${instX}','2026-11-21',250,'USD')`), /R-PERM-03/);
await err('M-4: other-owner update on X instruments rejected', () => fm(`update instruments set sector='Auto' where id='${instX}'`), /R-PERM-03/);
await err('M-4: owner_id change on instruments rejected', () => fm(`update instruments set owner_id='${X}' where id='${inst}'`), /R-PERM-01|immutable|owner/);
await err('M-4: owner_id change on positions rejected', () => fm(`update positions set owner_id='${X}' where id='${pos.id}'`), /R-PERM-01|immutable|owner|R-VAL-P01/);
await err('M-4: revoked bot position proposal insert rejected', () => fmRev(`insert into position_proposals(owner_id,change_type,position_id,proposed_values,evidence) values ('${U}','set_qty_avg','${pos.id}','{"qty":1}','[{"url":"https://m4"}]')`), /R-PERM-03/);
await err('M-4: expired bot principle proposal insert rejected', () => fmExp(`insert into principle_proposals(owner_id,principle_id,proposed_body_md,reason_md,evidence) values ('${U}','${urep}','x','y','[{"url":"https://m4"}]')`), /R-PERM-03/);
await ok('M-4: same-owner EA enriches instruments', () => ea(`update instruments set sector='IT' where id='${inst}'`));
await ok('M-4: same-owner EA snapshot upsert stamps calling bot', async () => {
	await ea(
		`insert into price_snapshots(owner_id,instrument_id,as_of,close,currency) values ('${U}','${inst}','2026-11-21',252000,'KRW') on conflict (instrument_id,as_of) do update set close=excluded.close`
	);
	const row = (
		await db.query(
			`select source_bot_id::text b, close::float c from price_snapshots where instrument_id='${inst}' and as_of='2026-11-21'`
		)
	).rows[0];
	if (row.b !== EA || row.c !== 252000) throw new Error(`stamp/close mismatch ${JSON.stringify(row)}`);
});
await err('M-4: FM cannot write targets_valuation (equity-analyst only)', () => fm(`insert into targets_valuation(owner_id,instrument_id,as_of,target_price,currency,opinion,source,report_id) values ('${U}','${inst}','2026-11-21',1,'KRW','buy','internal','${rep}')`), /R-PERM-04/);
await err('TRUNCATE positions denied to service_role', () => run('service_role', null, FM, 'truncate public.positions'), /permission denied/);
await err('TRUNCATE bot_clients denied to service_role', () => run('service_role', null, FM, 'truncate public.bot_clients'), /permission denied/);
await err('TRUNCATE principle_proposals denied to service_role', () => run('service_role', null, FM, 'truncate public.principle_proposals'), /permission denied/);
await err('TRUNCATE reports denied to service_role', () => run('service_role', null, FM, 'truncate public.reports'), /permission denied/);
await err('TRUNCATE instruments denied to service_role', () => run('service_role', null, FM, 'truncate public.instruments'), /permission denied/);
await err('TRUNCATE display_sequences denied to service_role', () => run('service_role', null, FM, 'truncate public.display_sequences'), /permission denied/);
eq(
	'default privileges: no PUBLIC EXECUTE on new functions',
	(
		await db.query(`
      select not exists (
        select 1
          from pg_default_acl d
          cross join lateral aclexplode(d.defaclacl) a
         where d.defaclnamespace = 'public'::regnamespace
           and d.defaclobjtype = 'f'
           and a.grantee = 0
           and a.privilege_type = 'EXECUTE'
      ) as ok`)
	).rows[0].ok,
	true
);
eq(
	'service_role lacks TRUNCATE on owned-data tables',
	(
		await db.query(`
      select bool_and(not has_table_privilege('service_role', format('public.%I', t), 'TRUNCATE')) as ok
        from unnest(array[
          'price_snapshots','portfolio_snapshots','targets_valuation','market_indicators',
          'market_indicator_keys','decisions','events','re_complexes','re_complex_snapshots',
          're_market_stats','re_subscriptions','display_sequences','journal_entries',
          'report_instruments','principle_proposals'
        ]) t`)
	).rows[0].ok,
	true
);
await err('anon cannot execute mowa_assert_bot_tenant', () => run('anon', null, null, `select public.mowa_assert_bot_tenant('${U}')`), /permission denied/);
const Z = '33333333-3333-3333-3333-333333333333';
await db.query(`insert into auth.users(id, email) values ('${Z}','cascade-del@x')`);
await db.query(
	`insert into reports(owner_id,kind,domain,slug,title,report_date,body_md) values ('${Z}','daily_brief','macro','cascade','c','2026-11-20','v1')`
);
await db.query(`update reports set body_md='v2' where owner_id='${Z}'`);
await db.query(
	`insert into mcp_audit_log(owner_id,actor_type,tool,result) values ('${Z}','system','cascade.probe','ok')`
);
eq(
	'pre-delete: revision + audit exist for Z',
	(
		await db.query(
			`select (select count(*)::int from report_revisions where owner_id='${Z}') r, (select count(*)::int from mcp_audit_log where owner_id='${Z}') a`
		)
	).rows[0],
	{ r: 1, a: 1 }
);
await ok('account deletion CASCADE past immutable triggers', () => db.query(`delete from auth.users where id='${Z}'`));
eq(
	'CASCADE removed revisions + audit for Z',
	(
		await db.query(
			`select (select count(*)::int from report_revisions where owner_id='${Z}') r, (select count(*)::int from mcp_audit_log where owner_id='${Z}') a`
		)
	).rows[0],
	{ r: 0, a: 0 }
);
await err('app DELETE on report_revisions still blocked', () => db.query(`delete from report_revisions where owner_id='${U}'`), /append-only|R-SYS-05/);
await err('app DELETE on mcp_audit_log still blocked', () => db.query(`delete from mcp_audit_log where owner_id='${U}'`), /append-only|R-SYS-05/);

console.log('\n[인증·감사]');
await err('R-SYS-05 감사 로그 append-only', () => db.query(`update mcp_audit_log set result='ok'`), /append-only/);
const au = await asBot(null)(`select * from mcp_authenticate('fmfmfmfm01','${H}','1.2.3.4')`);
eq('R-PERM-10 mcp_authenticate ok + profile', [au.rows.length, au.rows[0]?.profile, au.rows[0]?.allowed], [1, 'finance-manager', true]);
eq('오답 해시 → 빈 결과', (await asBot(null)(`select * from mcp_authenticate('fmfmfmfm01','${'d'.repeat(64)}')`)).rows.length, 0);
await err('authenticated는 mcp_authenticate 실행 불가', () => user(`select * from mcp_authenticate('fmfmfmfm01','${H}')`), /permission denied/);
await err('사용자 브라우저로 key_hash 조회 불가', () => user(`select key_hash from bot_clients`), /permission denied/);
await db.query(`update bot_clients set rate_limit_per_min=1 where id='${FM}'`);
eq('레이트리밋 초과 → allowed=false', (await asBot(null)(`select allowed from mcp_authenticate('fmfmfmfm01','${H}')`)).rows[0].allowed, false);
await db.query(`update bot_clients set revoked_at=now() where id='${FM}'`);
eq('폐기 키 → 빈 결과', (await asBot(null)(`select * from mcp_authenticate('fmfmfmfm01','${H}')`)).rows.length, 0);
await err('importer 키는 만료 필수', () => db.query(`insert into bot_clients(owner_id,name,profile,key_prefix,key_hash) values ('${U}','imp','importer','impimpimp1','${H}')`), /importer_expires/);
eq('승인/거절 감사 행 존재', (await db.query(`select count(*)::int c from mcp_audit_log where tool like 'proposal.%'`)).rows[0].c >= 2, true);

console.log('\n[GATED drop]');
if (process.env.MOWA_ALLOW_GATED_TEST === '1') {
	const gatedSql = readFileSync(gatedPath, 'utf8');
	await err('백업 검증 기록 없으면 drop 중단', () => db.exec(gatedSql), /backup not verified/);
	const live = (
		await db.query(`
    select jsonb_build_object(
      'assets', (select count(*)::int from assets),
      'asset_categories', (select count(*)::int from asset_categories),
      'asset_valuations', (select count(*)::int from asset_valuations),
      'liabilities', (select count(*)::int from liabilities),
      'liability_payments', (select count(*)::int from liability_payments),
      'snapshots', (select count(*)::int from snapshots),
      'goals', (select count(*)::int from goals),
      'cashflow_items', (select count(*)::int from cashflow_items)
    ) c`)
	).rows[0].c;
	await err('row_counts 불일치면 drop 중단', async () => {
		await db.query(
			`insert into mowa_backup_log(kind,file_name,sha256,row_counts,verified) values ('legacy_finance_dump','bad.dump','00','{"assets":999}',true)`
		);
		await db.exec(gatedSql);
	}, /row_counts mismatch|abort drop/);
	// wipe bad insert is blocked (immutable) — use a matching insert only
	await db.query(
		`insert into mowa_backup_log(kind,file_name,sha256,row_counts,verified) values ('legacy_finance_dump','ok.dump','00',$1::jsonb,true)`,
		[JSON.stringify(live)]
	);
	await ok('검증 기록 후 drop 실행', () => db.exec(gatedSql));
	eq(
		'레거시 테이블 제거·profiles 유지',
		(
			await db.query(`select count(*) filter (where table_name in ('assets','liabilities','cashflow_items','goals','snapshots'))::int legacy, count(*) filter (where table_name='profiles')::int prof from information_schema.tables where table_schema='public'`)
		).rows[0],
		{ legacy: 0, prof: 1 }
	);
} else {
	console.log('  (skip GATED drop tests — set MOWA_ALLOW_GATED_TEST=1 for local gated suite)');
}
console.log(`\nRESULT pass=${pass} fail=${fail}`);
if (postgrestProc) postgrestProc.kill('SIGTERM');
await pool.end();
process.exit(fail ? 1 : 0);
