-- MO_WA rebuild M1 · DRAFT (미적용) · 공용 확장/헬퍼
-- 규칙 기준: /workspace/mo_wa/rules.md v0.1 (규칙 ID를 주석에 표기)

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 현재 요청 주체가 service_role(=MCP 서버)인지. 마이그레이션 직접 접속(postgres)은 false.
create or replace function public.mowa_is_service()
returns boolean language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

-- MCP 서버가 PostgREST 요청 헤더 x-mowa-bot-id로 넘기는 호출 봇 id (R-PERM-03: 신원은 서버가 정함)
-- service-role 키를 가진 서버만 이 헤더로 DB에 닿을 수 있다. 가드 트리거의 "자기 행" 판정(R-PERM-01)에 쓴다.
create or replace function public.mowa_current_bot()
returns uuid language sql stable as $$
  select nullif((nullif(current_setting('request.headers', true), '')::json)->>'x-mowa-bot-id', '')::uuid;
$$;

-- 사용자별 설정 (미정 항목을 마이그레이션 없이 바꾸기 위한 확장 지점)
--  approval_extra_fields: 기본 [] (사용자 확정 Q-13: trigger_price·breakeven은 finance-manager가 직접 씀, R-PERM-17).
--                         값을 넣는 것은 규칙 개정 + 제안 유형 재도입이 필요하므로 v0.4에서는 []만 지원
--  (qty_allow_fraction 설정은 v0.4에서 삭제: 사용자 확정 Q-15 '주식·ETF 수량은 정수만' → 고정 규칙 R-VAL-M03)
--  proposal_expiry_days:  승인 큐 pending 만료 기간(일). PM 결정 Q-28: 기본 7, 설정으로 변경 가능(R-PERM-13 expired). position_proposals·principle_proposals 공통
create table public.app_settings (
  owner_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,60}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, key)
);
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

create or replace function public.mowa_setting(p_owner uuid, p_key text, p_default jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from public.app_settings where owner_id = p_owner and key = p_key), p_default);
$$;

-- 승인 큐 대상 필드 = 항상(qty, avg_price, status, currency) + 설정(기본 [], Q-13 확정)
create or replace function public.mowa_approval_fields(p_owner uuid)
returns text[] language sql stable as $$
  select array['qty','avg_price','status','currency']
      || array(select jsonb_array_elements_text(
                 public.mowa_setting(p_owner, 'approval_extra_fields', '[]'::jsonb)));
$$;

-- 봇 쓰기 공통 가드 (R-PERM-01 자기 행만 보관 / R-SYS-03 삭제 없음 / R-PERM-03 신원)
-- 사용: create trigger ... execute function public.mowa_bot_row_guard();  (source_bot_id 컬럼 필요)
create or replace function public.mowa_bot_row_guard()
returns trigger language plpgsql as $$
declare
  v_bot uuid;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
begin
  if not public.mowa_is_service() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception '[R-PERM-01] bots cannot delete (archive only)' using errcode = '42501';
  end if;
  v_bot := public.mowa_current_bot();
  if v_bot is null then
    raise exception '[R-PERM-03] missing bot identity' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if (v_old->>'source_bot_id') is distinct from v_bot::text then
      raise exception '[R-PERM-01] bots can only modify/archive rows they created' using errcode = '42501';
    end if;
    if (v_old->>'archived_at') is not null then
      raise exception '[R-PERM-01] archived rows can only be restored by the user' using errcode = '42501';
    end if;
  end if;
  if (v_new->>'source_bot_id') is distinct from v_bot::text then
    raise exception '[R-PERM-03] source_bot_id must be the calling bot' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Q-28: 제안 만료 시각 계산(기본 7일, app_settings.proposal_expiry_days로 변경). 1~90일 범위 밖 값은 기본값 사용
create or replace function public.mowa_proposal_expiry(p_owner uuid)
returns timestamptz language sql stable as $$
  select now() + make_interval(days => case
           when d between 1 and 90 then d else 7 end)
    from (select coalesce((public.mowa_setting(p_owner, 'proposal_expiry_days', '7'::jsonb))::text::int, 7) as d) x;
$$;

-- 수량 규칙(종목 유형별) — positions_guard, position_proposals_prepare, approve_proposal 공용
--   R-VAL-M03: stock·etf는 정수(사용자 확정 Q-15). cash는 0보다 큰 소수 허용, 소수점 이하 3자리 이상 ERROR(PM 확정 Q-31). bond 등은 v0.1 문구 유지(검사 없음)
create or replace function public.mowa_check_qty(p_asset text, p_qty numeric)
returns void language plpgsql immutable as $$
begin
  if p_qty is null then return; end if;
  if p_asset in ('stock','etf') and p_qty <> trunc(p_qty) then
    raise exception '[R-VAL-M03] fractional qty not allowed for %', p_asset using errcode = '22023';
  end if;
  if p_asset = 'cash' and p_qty * 100 <> trunc(p_qty * 100) then
    raise exception '[R-VAL-M03] cash qty allows at most 2 decimal places (Q-31)' using errcode = '22023';
  end if;
end;
$$;
