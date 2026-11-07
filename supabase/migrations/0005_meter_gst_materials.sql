-- Top-3 domains: hour meters / odometers (equipment & vehicles), GST tax invoices (freelancers),
-- decimal material quantities (trades). Safe to run more than once.

begin;

-- Equipment and vehicles: readings per entry (resources.meter_reading already exists)
alter table time_entries add column if not exists meter_start numeric;
alter table time_entries add column if not exists meter_end numeric;

-- GST invoices (BL-7)
alter table workspaces add column if not exists gstin text;
alter table workspaces add column if not exists gst_rate numeric;
alter table workspaces add column if not exists invoice_prefix text;
alter table workspaces add column if not exists payment_terms_days int;
alter table customers add column if not exists gstin text;
alter table bills add column if not exists tax_paise bigint not null default 0;
alter table bills add column if not exists gst_rate numeric;
alter table bills add column if not exists igst boolean not null default false;
alter table bills add column if not exists due_at timestamptz;

-- Trades: materials like "2.5 m wire" need decimal quantities.
-- The customer_balances view reads entry_items.quantity, so it is dropped and recreated around the change.
drop view if exists customer_balances;
alter table entry_items alter column quantity type numeric using quantity::numeric;

-- Same balance the app shows: work + materials (each line rounded to whole paise) + GST on bills - payments
create view customer_balances with (security_invoker = true) as
select c.id as customer_id, c.workspace_id,
  c.opening_balance_paise
  + coalesce((select sum(t.amount_paise) from time_entries t where t.customer_id = c.id and t.deleted_at is null and t.status <> 'running'), 0)
  + coalesce((select sum(round(i.amount_paise * i.quantity)) from entry_items i join time_entries t on t.id = i.entry_id
              where t.customer_id = c.id and t.deleted_at is null and i.deleted_at is null and t.status <> 'running'), 0)
  + coalesce((select sum(b.tax_paise) from bills b where b.customer_id = c.id and b.deleted_at is null), 0)
  - coalesce((select sum(p.amount_paise) from payments p where p.customer_id = c.id and p.deleted_at is null), 0) as balance_paise
from customers c where c.deleted_at is null;

commit;
