-- Hourly Tracker: core schema (Phase 1). Mirrors the local SQLite schema in src/db/client.ts.
-- Money = integer paise. Time = integer seconds. Client-generated UUIDs. Soft deletes.
-- Local clients store timestamps as epoch ms; the sync engine (Phase 2) converts to timestamptz.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text, phone text,
  account_type text not null default 'earner' check (account_type in ('earner','hirer')),
  created_at timestamptz default now()
);

create table workspaces (
  id uuid primary key,
  name text not null,
  owner_id uuid not null references auth.users,
  template text not null,
  enabled_modules jsonb default '[]',
  phone text, address text, upi_id text, logo_path text,
  timezone text default 'Asia/Kolkata',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid not null references auth.users,
  role text not null check (role in ('owner','manager','member')),
  can_see_amounts boolean not null default false,
  status text not null default 'active',
  primary key (workspace_id, user_id)
);

-- helper used by every policy
create function is_member(ws uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;
create function is_manager(ws uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner','manager'));
$$;
create function can_see_money(ws uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()
                 and (m.role in ('owner','manager') or m.can_see_amounts));
$$;

create table resources (
  id uuid primary key, workspace_id uuid not null references workspaces,
  name text not null, kind text not null default 'self' check (kind in ('self','worker','machine','vehicle','space','service')),
  identifier text, meter_reading numeric, is_active boolean not null default true,
  updated_at timestamptz default now(), deleted_at timestamptz
);
create table rates (
  id uuid primary key, workspace_id uuid not null references workspaces,
  resource_id uuid references resources, customer_id uuid, variant_name text,
  unit text not null check (unit in ('hour','day','shift','session','trip','km','acre','piece','job')),
  amount_paise bigint not null, min_seconds int default 0, rounding_seconds int default 0,
  overtime_after_seconds int, overtime_amount_paise bigint, visit_charge_paise bigint default 0,
  updated_at timestamptz default now(), deleted_at timestamptz
);
create table customers (
  id uuid primary key, workspace_id uuid not null references workspaces,
  name text not null, phone text, area text, opening_balance_paise bigint default 0, linked_profile_id uuid,
  updated_at timestamptz default now(), deleted_at timestamptz
);
create table sites (
  id uuid primary key, workspace_id uuid not null references workspaces,
  customer_id uuid not null references customers, name text not null, budget_seconds int,
  updated_at timestamptz default now(), deleted_at timestamptz
);
create table bills (
  id uuid primary key, workspace_id uuid not null references workspaces,
  customer_id uuid not null references customers, number int not null,
  period_from timestamptz, period_to timestamptz,
  subtotal_paise bigint not null, previous_balance_paise bigint not null, total_paise bigint not null,
  status text not null default 'draft' check (status in ('draft','sent','partly_paid','paid')),
  share_token text unique, sent_at timestamptz,
  updated_at timestamptz default now(), deleted_at timestamptz
);
create table time_entries (
  id uuid primary key, workspace_id uuid not null references workspaces,
  resource_id uuid not null references resources, customer_id uuid references customers,
  site_id uuid references sites, member_id uuid references auth.users, rate_id uuid references rates,
  variant_name text,
  started_at timestamptz not null, ended_at timestamptz,
  break_seconds int default 0, billable_seconds int default 0,
  quantity numeric, unit text, rate_snapshot jsonb, amount_paise bigint default 0,
  status text not null default 'running' check (status in ('running','done','billed')),
  source text not null default 'live' check (source in ('live','manual','adjusted','edited')),
  device_uptime_start bigint, device_uptime_end bigint,
  server_started_at timestamptz, server_ended_at timestamptz,
  tamper_flag boolean default false,
  confirmation_status text default 'none', approval_status text,
  bill_id uuid references bills, note text,
  updated_at timestamptz default now(), deleted_at timestamptz
);
create index on time_entries (workspace_id, updated_at);
create index on time_entries (customer_id, started_at);
create table entry_items (
  id uuid primary key, workspace_id uuid not null references workspaces,
  entry_id uuid not null references time_entries, description text not null,
  quantity int default 1, amount_paise bigint not null,
  updated_at timestamptz default now(), deleted_at timestamptz
);
create table payments (
  id uuid primary key, workspace_id uuid not null references workspaces,
  customer_id uuid not null references customers, bill_id uuid references bills,
  amount_paise bigint not null, method text not null default 'cash' check (method in ('cash','upi','bank','other')),
  received_at timestamptz not null default now(), note text,
  updated_at timestamptz default now(), deleted_at timestamptz
);

-- server-side stamp: clients cannot set server_* columns
create function stamp_server_times() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.server_started_at := now(); end if;
  if new.ended_at is not null and (tg_op = 'INSERT' or old.ended_at is null) then new.server_ended_at := now(); end if;
  if tg_op = 'UPDATE' then new.server_started_at := old.server_started_at; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_stamp before insert or update on time_entries for each row execute function stamp_server_times();

-- billed entries are immutable (changes must be separate adjustment entries)
create function block_billed_edit() returns trigger language plpgsql as $$
begin
  if old.status = 'billed' and (new.amount_paise is distinct from old.amount_paise
     or new.started_at is distinct from old.started_at or new.ended_at is distinct from old.ended_at) then
    raise exception 'ENTRY_BILLED_LOCKED';
  end if;
  return new;
end $$;
create trigger trg_block_billed before update on time_entries for each row execute function block_billed_edit();

-- views
create view customer_balances with (security_invoker = true) as
select c.id as customer_id, c.workspace_id,
  c.opening_balance_paise
  + coalesce((select sum(t.amount_paise) from time_entries t where t.customer_id = c.id and t.deleted_at is null and t.status <> 'running'), 0)
  + coalesce((select sum(i.amount_paise * i.quantity) from entry_items i join time_entries t on t.id = i.entry_id
              where t.customer_id = c.id and t.deleted_at is null and i.deleted_at is null and t.status <> 'running'), 0)
  - coalesce((select sum(p.amount_paise) from payments p where p.customer_id = c.id and p.deleted_at is null), 0) as balance_paise
from customers c where c.deleted_at is null;

-- Row Level Security
alter table profiles enable row level security;
create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());

alter table workspaces enable row level security;
create policy "members read workspace" on workspaces for select using (is_member(id) or owner_id = auth.uid());
create policy "owner creates workspace" on workspaces for insert with check (owner_id = auth.uid());
create policy "managers update workspace" on workspaces for update using (is_manager(id));

alter table workspace_members enable row level security;
create policy "read own membership" on workspace_members for select using (user_id = auth.uid() or is_manager(workspace_id));
create policy "owner bootstraps self" on workspace_members for insert
  with check (user_id = auth.uid() and role = 'owner'
              and exists (select 1 from workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy "managers manage members" on workspace_members for all using (is_manager(workspace_id)) with check (is_manager(workspace_id));

-- tables every member can read, only managers write
do $$
declare t text;
begin
  foreach t in array array['resources','rates','customers','sites'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "members read" on %I for select using (is_member(workspace_id))', t);
    execute format('create policy "managers write" on %I for all using (is_manager(workspace_id)) with check (is_manager(workspace_id))', t);
  end loop;
end $$;

-- money tables: only managers, or members granted can_see_amounts
do $$
declare t text;
begin
  foreach t in array array['bills','payments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "money read" on %I for select using (can_see_money(workspace_id))', t);
    execute format('create policy "managers write" on %I for all using (is_manager(workspace_id)) with check (is_manager(workspace_id))', t);
  end loop;
end $$;

alter table time_entries enable row level security;
create policy "read entries" on time_entries for select using (
  is_manager(workspace_id) or (is_member(workspace_id) and member_id = auth.uid()));
create policy "members insert own entries" on time_entries for insert with check (
  is_member(workspace_id) and (member_id = auth.uid() or is_manager(workspace_id)));
create policy "update entries" on time_entries for update using (
  is_manager(workspace_id) or (member_id = auth.uid() and status = 'running'));

alter table entry_items enable row level security;
create policy "items follow entry" on entry_items for all
  using (exists (select 1 from time_entries t where t.id = entry_id and (is_manager(t.workspace_id) or t.member_id = auth.uid())))
  with check (exists (select 1 from time_entries t where t.id = entry_id and (is_manager(t.workspace_id) or t.member_id = auth.uid())));

-- Plan limits (Phase 2) are enforced by triggers against a limits config table; see PRD section 9.
