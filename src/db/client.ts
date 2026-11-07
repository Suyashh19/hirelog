import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

export const sqlite = openDatabaseSync('hourly.db');
export const db = drizzle(sqlite, { schema });

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, template TEXT NOT NULL, phone TEXT, address TEXT,
    upi_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'self', identifier TEXT, is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS rates (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    resource_id TEXT, customer_id TEXT, variant_name TEXT, unit TEXT NOT NULL, amount_paise INTEGER NOT NULL,
    min_seconds INTEGER NOT NULL DEFAULT 0, rounding_seconds INTEGER NOT NULL DEFAULT 0,
    overtime_after_seconds INTEGER, overtime_amount_paise INTEGER, visit_charge_paise INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    name TEXT NOT NULL, phone TEXT, area TEXT, opening_balance_paise INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    customer_id TEXT NOT NULL, name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    resource_id TEXT NOT NULL, customer_id TEXT, site_id TEXT, rate_id TEXT, variant_name TEXT,
    started_at INTEGER NOT NULL, ended_at INTEGER, break_seconds INTEGER NOT NULL DEFAULT 0, pause_started_at INTEGER,
    billable_seconds INTEGER NOT NULL DEFAULT 0, quantity REAL, unit TEXT NOT NULL DEFAULT 'hour',
    rate_snapshot TEXT, amount_paise INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'running',
    source TEXT NOT NULL DEFAULT 'live', device_uptime_start INTEGER, device_uptime_end INTEGER,
    tamper_flag INTEGER NOT NULL DEFAULT 0, bill_id TEXT, note TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_te_customer ON time_entries (customer_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_te_status ON time_entries (status);
  CREATE TABLE IF NOT EXISTS entry_items (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    entry_id TEXT NOT NULL, description TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, amount_paise INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entry_history (
    id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, at INTEGER NOT NULL, before TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    customer_id TEXT NOT NULL, number INTEGER NOT NULL, period_from INTEGER NOT NULL, period_to INTEGER NOT NULL,
    subtotal_paise INTEGER NOT NULL, previous_balance_paise INTEGER NOT NULL, total_paise INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', sent_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    customer_id TEXT NOT NULL, bill_id TEXT, amount_paise INTEGER NOT NULL, method TEXT NOT NULL DEFAULT 'cash',
    received_at INTEGER NOT NULL, note TEXT
  );
  CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, row_id TEXT NOT NULL, op TEXT NOT NULL,
    payload TEXT NOT NULL, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  // 2: RS-5 night/holiday rate. Holidays are set once per business.
  `
  ALTER TABLE rates ADD COLUMN night_from_min INTEGER;
  ALTER TABLE rates ADD COLUMN night_to_min INTEGER;
  ALTER TABLE rates ADD COLUMN night_amount_paise INTEGER;
  ALTER TABLE rates ADD COLUMN holiday_amount_paise INTEGER;
  ALTER TABLE workspaces ADD COLUMN holiday_weekdays TEXT;
  ALTER TABLE workspaces ADD COLUMN holiday_dates TEXT;
  `,
  // 3: hour meters (equipment), GST invoices (freelancers/business), decimal material quantities
  `
  ALTER TABLE resources ADD COLUMN meter_reading REAL;
  ALTER TABLE time_entries ADD COLUMN meter_start REAL;
  ALTER TABLE time_entries ADD COLUMN meter_end REAL;
  ALTER TABLE workspaces ADD COLUMN gstin TEXT;
  ALTER TABLE workspaces ADD COLUMN gst_rate REAL;
  ALTER TABLE workspaces ADD COLUMN invoice_prefix TEXT;
  ALTER TABLE workspaces ADD COLUMN payment_terms_days INTEGER;
  ALTER TABLE customers ADD COLUMN gstin TEXT;
  ALTER TABLE bills ADD COLUMN tax_paise INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE bills ADD COLUMN gst_rate REAL;
  ALTER TABLE bills ADD COLUMN igst INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE bills ADD COLUMN due_at INTEGER;
  `,
  // 4: minimum quantity for count units (e.g. 250 km a day, 1 day minimum)
  `
  ALTER TABLE rates ADD COLUMN min_quantity REAL;
  `,
  // 5: how each price is measured (timer / gps / odometer / hourmeter / count) and the km GPS counted on a trip
  `
  ALTER TABLE rates ADD COLUMN measure TEXT;
  ALTER TABLE time_entries ADD COLUMN gps_km REAL;
  `,
  // 6: phases A–E — country, confirmation, GPS places, TDS, monthly hire, quotes, expenses, photos
  `
  ALTER TABLE workspaces ADD COLUMN country TEXT;
  ALTER TABLE workspaces ADD COLUMN distance_unit TEXT;
  ALTER TABLE workspaces ADD COLUMN pay_link TEXT;
  ALTER TABLE workspaces ADD COLUMN lang TEXT;
  ALTER TABLE workspaces ADD COLUMN reminder_days TEXT;
  ALTER TABLE time_entries ADD COLUMN confirm_token TEXT;
  ALTER TABLE time_entries ADD COLUMN confirmation_status TEXT;
  ALTER TABLE time_entries ADD COLUMN confirmation_note TEXT;
  ALTER TABLE time_entries ADD COLUMN confirmed_at INTEGER;
  ALTER TABLE time_entries ADD COLUMN gps_from TEXT;
  ALTER TABLE time_entries ADD COLUMN gps_to TEXT;
  ALTER TABLE time_entries ADD COLUMN operator_name TEXT;
  ALTER TABLE rates ADD COLUMN monthly_fee_paise INTEGER;
  ALTER TABLE rates ADD COLUMN included_hours REAL;
  ALTER TABLE customers ADD COLUMN tds_rate REAL;
  ALTER TABLE bills ADD COLUMN tds_paise INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE bills ADD COLUMN tds_rate REAL;
  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    customer_id TEXT, number INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft', valid_until INTEGER, note TEXT,
    lines TEXT NOT NULL DEFAULT '[]', total_paise INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    resource_id TEXT, category TEXT NOT NULL DEFAULT 'other', amount_paise INTEGER NOT NULL, spent_at INTEGER NOT NULL,
    litres REAL, note TEXT
  );
  CREATE TABLE IF NOT EXISTS entry_photos (
    id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, uri TEXT NOT NULL, taken_at INTEGER NOT NULL, label TEXT
  );
  `,
];

/** Runs pending migrations using PRAGMA user_version. Synchronous, safe to call at startup. */
export function migrate() {
  const row = sqlite.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let v = row?.user_version ?? 0;
  while (v < MIGRATIONS.length) {
    sqlite.execSync('BEGIN');
    try {
      sqlite.execSync(MIGRATIONS[v]);
      v += 1;
      sqlite.execSync(`PRAGMA user_version = ${v}`);
      sqlite.execSync('COMMIT');
    } catch (e) {
      sqlite.execSync('ROLLBACK');
      throw e;
    }
  }
}
