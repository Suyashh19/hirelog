-- Phases A–E in one go: countries, customer confirmation, GPS places, TDS, monthly hire, quotes, expenses, team invites.
-- Safe to run more than once.
begin;

-- 0) Bug fix: time_entries never had the server-side updated_at stamp, so edits did not reach other phones.
drop trigger if exists trg_touch on time_entries;
create trigger trg_touch before insert or update on time_entries for each row execute function touch_updated_at();

-- A) Country / currency / distance / how customers pay / language
alter table workspaces add column if not exists country text;
alter table workspaces add column if not exists distance_unit text;
alter table workspaces add column if not exists pay_link text;
alter table workspaces add column if not exists lang text;
alter table workspaces add column if not exists reminder_days text;

-- B) Proof: customer confirmation, GPS places
alter table time_entries add column if not exists confirm_token text;
create unique index if not exists time_entries_confirm_token on time_entries (confirm_token) where confirm_token is not null;
alter table time_entries add column if not exists confirmation_note text;
alter table time_entries add column if not exists confirmed_at timestamptz;
alter table time_entries add column if not exists gps_from text;
alter table time_entries add column if not exists gps_to text;
alter table time_entries add column if not exists operator_name text;

-- C) Monthly hire contracts (fixed fee includes N hours, extra hours at the price's hourly rate)
alter table rates add column if not exists monthly_fee_paise bigint;
alter table rates add column if not exists included_hours numeric;

-- D) TDS (India): the client keeps a % and pays it to the government on your behalf
alter table customers add column if not exists tds_rate numeric;
alter table bills add column if not exists tds_paise bigint not null default 0;
alter table bills add column if not exists tds_rate numeric;

-- C) Quotes
create table if not exists quotes (
  id uuid primary key, workspace_id uuid not null references workspaces,
  customer_id uuid references customers, number int not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','converted')),
  valid_until timestamptz, note text, lines jsonb not null default '[]', total_paise bigint not null default 0,
  updated_at timestamptz default now(), deleted_at timestamptz
);
-- D) Expenses (fuel, repairs, parts, wages…) per machine / vehicle / service
create table if not exists expenses (
  id uuid primary key, workspace_id uuid not null references workspaces,
  resource_id uuid references resources, category text not null default 'other',
  amount_paise bigint not null, spent_at timestamptz not null default now(), litres numeric, note text,
  updated_at timestamptz default now(), deleted_at timestamptz
);
do $$
declare t text;
begin
  foreach t in array array['quotes','expenses'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "money read" on %I', t);
    execute format('drop policy if exists "managers write" on %I', t);
    execute format('create policy "money read" on %I for select using (can_see_money(workspace_id))', t);
    execute format('create policy "managers write" on %I for all using (is_manager(workspace_id)) with check (is_manager(workspace_id))', t);
    execute format('drop trigger if exists trg_touch on %I', t);
    execute format('create trigger trg_touch before insert or update on %I for each row execute function touch_updated_at()', t);
  end loop;
end $$;

-- B) Customer confirmation pages (public, no sign-in): read one entry by its secret token, and answer once.
create or replace function get_confirmation(t text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business', w.name, 'business_phone', w.phone, 'customer', c.name, 'work', r.name, 'variant', e.variant_name,
    'started_at', e.started_at, 'ended_at', e.ended_at, 'unit', e.unit, 'billable_seconds', e.billable_seconds,
    'quantity', e.quantity, 'meter_start', e.meter_start, 'meter_end', e.meter_end, 'gps_km', e.gps_km,
    'gps_from', e.gps_from, 'gps_to', e.gps_to, 'amount_paise', e.amount_paise, 'currency', coalesce(w.country, 'IN'),
    'status', coalesce(e.confirmation_status, 'none'), 'note', e.confirmation_note, 'confirmed_at', e.confirmed_at)
  from time_entries e join workspaces w on w.id = e.workspace_id
  left join customers c on c.id = e.customer_id left join resources r on r.id = e.resource_id
  where e.confirm_token = t and length(t) >= 20 and e.deleted_at is null
$$;
create or replace function respond_confirmation(t text, agree boolean, note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if t is null or length(t) < 20 then raise exception 'BAD_TOKEN'; end if;
  update time_entries set confirmation_status = case when agree then 'confirmed' else 'disputed' end,
    confirmation_note = left(note, 500), confirmed_at = now()
  where confirm_token = t and deleted_at is null and status <> 'running'
    and coalesce(confirmation_status, 'none') in ('none', 'pending')
  returning confirmation_status into s;
  if s is null then
    select coalesce(confirmation_status, 'none') into s from time_entries where confirm_token = t;
  end if;
  return coalesce(s, 'not_found');
end $$;
grant execute on function get_confirmation(text) to anon, authenticated;
grant execute on function respond_confirmation(text, boolean, text) to anon, authenticated;

-- E) Team: the owner makes a 6-digit code; an operator signs in and joins with it.
create table if not exists invites (
  code text primary key, workspace_id uuid not null references workspaces on delete cascade,
  role text not null default 'member' check (role in ('manager','member')),
  can_see_amounts boolean not null default false, created_by uuid references auth.users,
  expires_at timestamptz not null default now() + interval '7 days', used_by uuid references auth.users
);
alter table invites enable row level security;
drop policy if exists "managers manage invites" on invites;
create policy "managers manage invites" on invites for all using (is_manager(workspace_id)) with check (is_manager(workspace_id));

create or replace function create_invite(ws uuid, member_role text default 'member', see_amounts boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_manager(ws) then raise exception 'NOT_ALLOWED'; end if;
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from invites where code = c and expires_at > now() and used_by is null);
  end loop;
  insert into invites (code, workspace_id, role, can_see_amounts, created_by) values (c, ws, member_role, see_amounts, auth.uid())
  on conflict (code) do update set workspace_id = excluded.workspace_id, role = excluded.role,
    can_see_amounts = excluded.can_see_amounts, created_by = excluded.created_by, expires_at = now() + interval '7 days', used_by = null;
  return c;
end $$;
create or replace function join_with_code(c text) returns uuid language plpgsql security definer set search_path = public as $$
declare i invites%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into i from invites where code = c and expires_at > now() and used_by is null;
  if not found then raise exception 'BAD_CODE'; end if;
  insert into profiles (id) values (auth.uid()) on conflict do nothing;
  insert into workspace_members (workspace_id, user_id, role, can_see_amounts)
    values (i.workspace_id, auth.uid(), i.role, i.can_see_amounts)
    on conflict (workspace_id, user_id) do update set role = excluded.role, can_see_amounts = excluded.can_see_amounts, status = 'active';
  update invites set used_by = auth.uid() where code = c;
  return i.workspace_id;
end $$;
create or replace function my_membership(ws uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('role', role, 'can_see_amounts', can_see_amounts) from workspace_members
  where workspace_id = ws and user_id = auth.uid()
$$;
create or replace function list_members(ws uuid) returns table (user_id uuid, email text, role text, can_see_amounts boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role, m.can_see_amounts from workspace_members m join auth.users u on u.id = m.user_id
  where m.workspace_id = ws and is_manager(ws) and m.status = 'active'
$$;
revoke all on function create_invite(uuid, text, boolean) from public, anon;
grant execute on function create_invite(uuid, text, boolean) to authenticated;
revoke all on function join_with_code(text) from public, anon;
grant execute on function join_with_code(text) to authenticated;
revoke all on function my_membership(uuid) from public, anon;
grant execute on function my_membership(uuid) to authenticated;
revoke all on function list_members(uuid) from public, anon;
grant execute on function list_members(uuid) to authenticated;

-- Account deletion also removes the new tables
create or replace function delete_my_account() returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ws uuid;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  for ws in select id from workspaces where owner_id = uid loop
    delete from entry_items where workspace_id = ws;
    delete from time_entries where workspace_id = ws;
    delete from payments where workspace_id = ws;
    delete from bills where workspace_id = ws;
    delete from quotes where workspace_id = ws;
    delete from expenses where workspace_id = ws;
    delete from invites where workspace_id = ws;
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

-- Balance view now also subtracts TDS the client keeps
drop view if exists customer_balances;
create view customer_balances with (security_invoker = true) as
select c.id as customer_id, c.workspace_id,
  c.opening_balance_paise
  + coalesce((select sum(t.amount_paise) from time_entries t where t.customer_id = c.id and t.deleted_at is null and t.status <> 'running'), 0)
  + coalesce((select sum(round(i.amount_paise * i.quantity)) from entry_items i join time_entries t on t.id = i.entry_id
              where t.customer_id = c.id and t.deleted_at is null and i.deleted_at is null and t.status <> 'running'), 0)
  + coalesce((select sum(b.tax_paise - b.tds_paise) from bills b where b.customer_id = c.id and b.deleted_at is null), 0)
  - coalesce((select sum(p.amount_paise) from payments p where p.customer_id = c.id and p.deleted_at is null), 0) as balance_paise
from customers c where c.deleted_at is null;

commit;
