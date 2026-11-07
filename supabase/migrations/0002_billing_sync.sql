-- Phase 2: sync support, subscriptions, entitlements, plan limits, account deletion.

-- Server is authoritative for updated_at so clients can pull "changes since X" reliably.
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['workspaces','resources','rates','customers','sites','bills','entry_items','payments'] loop
    execute format('create trigger trg_touch before insert or update on %I for each row execute function touch_updated_at()', t);
  end loop;
end $$;

-- Plan limits live in a table so they can be tuned without an app update. null = unlimited.
create table plan_limits (
  plan text primary key check (plan in ('free','pro','business')),
  resources int, customers int, members int, history_days int, pdf_bills_per_month int
);
insert into plan_limits values
  ('free', 1, 5, 0, 60, 10),
  ('pro', 5, null, 0, null, null),
  ('business', 15, null, 10, null, null);
alter table plan_limits enable row level security;
create policy "anyone reads limits" on plan_limits for select using (true);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  product_id text not null check (product_id in ('pro','business')),
  base_plan_id text not null check (base_plan_id in ('monthly','sixmonth','yearly')),
  purchase_token text unique not null,
  state text not null, -- active | grace | on_hold | canceled | expired | revoked
  expires_at timestamptz not null,
  auto_renewing boolean,
  last_verified_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "managers read subscriptions" on subscriptions for select using (is_manager(workspace_id));
-- writes: Edge Functions with the service key only (no insert/update policies)

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  plan text not null check (plan in ('free','pro','business')),
  source text not null check (source in ('play','trial','founding','referral')),
  expires_at timestamptz,
  updated_at timestamptz default now(),
  unique (workspace_id, source)
);
alter table entitlements enable row level security;
create policy "members read entitlements" on entitlements for select using (is_member(workspace_id));

create view current_plan with (security_invoker = true) as
select workspace_id,
  (array_agg(plan order by case plan when 'business' then 2 when 'pro' then 1 else 0 end desc))[1] as plan
from entitlements where expires_at is null or expires_at > now()
group by workspace_id;

create function plan_of(ws uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select plan from current_plan where workspace_id = ws), 'free');
$$;

-- App calls this on launch / after purchase / on sync.
create function get_entitlements(ws uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p text; e record; l record;
begin
  if not is_member(ws) then raise exception 'NOT_A_MEMBER'; end if;
  p := plan_of(ws);
  select source, expires_at into e from entitlements
    where workspace_id = ws and plan = p and (expires_at is null or expires_at > now()) order by expires_at desc nulls first limit 1;
  select * into l from plan_limits where plan = p;
  return jsonb_build_object('plan', p, 'source', e.source, 'expires_at', e.expires_at, 'limits', to_jsonb(l));
end $$;

-- New workspaces get Founding Business until 31 May 2027 (launch window), else a 14-day Business trial.
create function grant_starting_entitlement() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if now() < timestamptz '2027-05-31 23:59:59+05:30' then
    insert into entitlements (workspace_id, plan, source, expires_at) values (new.id, 'business', 'founding', timestamptz '2027-05-31 23:59:59+05:30');
  else
    insert into entitlements (workspace_id, plan, source, expires_at) values (new.id, 'business', 'trial', now() + interval '14 days');
  end if;
  return new;
end $$;
create trigger trg_grant_entitlement after insert on workspaces for each row execute function grant_starting_entitlement();

-- Limits enforced in the database so a modified APK cannot bypass them.
-- Upserts fire BEFORE INSERT even for existing rows, so existing ids are always allowed through.
create function enforce_resource_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  if exists (select 1 from resources where id = new.id) or new.deleted_at is not null or not new.is_active then return new; end if;
  select resources into lim from plan_limits where plan = plan_of(new.workspace_id);
  if lim is not null then
    select count(*) into cnt from resources where workspace_id = new.workspace_id and deleted_at is null and is_active;
    if cnt >= lim then raise exception 'PLAN_LIMIT_RESOURCES'; end if;
  end if;
  return new;
end $$;
create trigger trg_limit_resources before insert on resources for each row execute function enforce_resource_limit();

create function enforce_customer_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  if exists (select 1 from customers where id = new.id) or new.deleted_at is not null then return new; end if;
  select customers into lim from plan_limits where plan = plan_of(new.workspace_id);
  if lim is not null then
    select count(*) into cnt from customers where workspace_id = new.workspace_id and deleted_at is null;
    if cnt >= lim then raise exception 'PLAN_LIMIT_CUSTOMERS'; end if;
  end if;
  return new;
end $$;
create trigger trg_limit_customers before insert on customers for each row execute function enforce_customer_limit();

-- Account deletion: removes everything the caller owns, then the auth user.
create function delete_my_account() returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ws uuid;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  for ws in select id from workspaces where owner_id = uid loop
    delete from entry_items where workspace_id = ws;
    delete from time_entries where workspace_id = ws;
    delete from payments where workspace_id = ws;
    delete from bills where workspace_id = ws;
    delete from sites where workspace_id = ws;
    delete from rates where workspace_id = ws;
    delete from customers where workspace_id = ws;
    delete from resources where workspace_id = ws;
    delete from subscriptions where workspace_id = ws;
    delete from entitlements where workspace_id = ws;
    delete from workspace_members where workspace_id = ws;
    delete from workspaces where id = ws;
  end loop;
  delete from workspace_members where user_id = uid;
  delete from profiles where id = uid;
  delete from auth.users where id = uid;
end $$;
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

revoke all on function plan_of(uuid) from public, anon;
grant execute on function plan_of(uuid) to authenticated;
revoke all on function get_entitlements(uuid) from public, anon;
grant execute on function get_entitlements(uuid) to authenticated;
