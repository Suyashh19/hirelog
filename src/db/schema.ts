import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * Local schema mirrors the Supabase schema (supabase/migrations/0001_init.sql):
 * every row has a client UUID, workspace_id, updated_at (ms) and soft-delete deleted_at.
 * Money = integer paise, time = integer seconds, timestamps = epoch milliseconds.
 */
const common = {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
};

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  template: text('template').notNull(),
  phone: text('phone'),
  address: text('address'),
  upiId: text('upi_id'),
  holidayWeekdays: text('holiday_weekdays'), // "0,6" (0 = Sunday)
  holidayDates: text('holiday_dates'), // "01-26,2027-03-14" (MM-DD every year, or one date)
  gstin: text('gstin'),
  gstRate: real('gst_rate'),
  invoicePrefix: text('invoice_prefix'),
  paymentTermsDays: integer('payment_terms_days'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const resources = sqliteTable('resources', {
  ...common,
  name: text('name').notNull(),
  kind: text('kind').notNull().default('self'),
  identifier: text('identifier'),
  isActive: integer('is_active').notNull().default(1),
  meterReading: real('meter_reading'), // machines: last hour-meter reading
});

export const rates = sqliteTable('rates', {
  ...common,
  resourceId: text('resource_id'),
  customerId: text('customer_id'),
  variantName: text('variant_name'),
  unit: text('unit').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  minSeconds: integer('min_seconds').notNull().default(0),
  roundingSeconds: integer('rounding_seconds').notNull().default(0),
  overtimeAfterSeconds: integer('overtime_after_seconds'),
  overtimeAmountPaise: integer('overtime_amount_paise'),
  visitChargePaise: integer('visit_charge_paise').notNull().default(0),
  nightFromMin: integer('night_from_min'),
  nightToMin: integer('night_to_min'),
  nightAmountPaise: integer('night_amount_paise'),
  holidayAmountPaise: integer('holiday_amount_paise'),
  minQuantity: real('min_quantity'),
  measure: text('measure'), // timer | gps | odometer | hourmeter | count
});

export const customers = sqliteTable('customers', {
  ...common,
  name: text('name').notNull(),
  phone: text('phone'),
  area: text('area'),
  openingBalancePaise: integer('opening_balance_paise').notNull().default(0),
  gstin: text('gstin'),
});

export const sites = sqliteTable('sites', {
  ...common,
  customerId: text('customer_id').notNull(),
  name: text('name').notNull(),
});

export const timeEntries = sqliteTable('time_entries', {
  ...common,
  resourceId: text('resource_id').notNull(),
  customerId: text('customer_id'),
  siteId: text('site_id'),
  rateId: text('rate_id'),
  variantName: text('variant_name'),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  breakSeconds: integer('break_seconds').notNull().default(0),
  pauseStartedAt: integer('pause_started_at'), // local only: set while on break
  billableSeconds: integer('billable_seconds').notNull().default(0),
  quantity: real('quantity'),
  unit: text('unit').notNull().default('hour'),
  rateSnapshot: text('rate_snapshot'), // JSON
  amountPaise: integer('amount_paise').notNull().default(0),
  status: text('status').notNull().default('running'), // running | done | billed
  source: text('source').notNull().default('live'), // live | manual | adjusted | edited
  deviceUptimeStart: integer('device_uptime_start'),
  deviceUptimeEnd: integer('device_uptime_end'),
  tamperFlag: integer('tamper_flag').notNull().default(0),
  billId: text('bill_id'),
  note: text('note'),
  meterStart: real('meter_start'),
  meterEnd: real('meter_end'),
  gpsKm: real('gps_km'), // km counted by the phone's GPS during a trip
});

export const entryItems = sqliteTable('entry_items', {
  ...common,
  entryId: text('entry_id').notNull(),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull().default(1),
  amountPaise: integer('amount_paise').notNull(),
});

export const entryHistory = sqliteTable('entry_history', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull(),
  at: integer('at').notNull(),
  before: text('before').notNull(), // JSON of previous row
});

export const bills = sqliteTable('bills', {
  ...common,
  customerId: text('customer_id').notNull(),
  number: integer('number').notNull(),
  periodFrom: integer('period_from').notNull(),
  periodTo: integer('period_to').notNull(),
  subtotalPaise: integer('subtotal_paise').notNull(),
  previousBalancePaise: integer('previous_balance_paise').notNull(),
  totalPaise: integer('total_paise').notNull(),
  status: text('status').notNull().default('draft'), // draft | sent | partly_paid | paid
  sentAt: integer('sent_at'),
  taxPaise: integer('tax_paise').notNull().default(0),
  gstRate: real('gst_rate'),
  igst: integer('igst').notNull().default(0),
  dueAt: integer('due_at'),
});

export const payments = sqliteTable('payments', {
  ...common,
  customerId: text('customer_id').notNull(),
  billId: text('bill_id'),
  amountPaise: integer('amount_paise').notNull(),
  method: text('method').notNull().default('cash'), // cash | upi | bank | other
  receivedAt: integer('received_at').notNull(),
  note: text('note'),
});

export const outbox = sqliteTable('outbox', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  op: text('op').notNull(), // upsert | delete
  payload: text('payload').notNull(),
  createdAt: integer('created_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
});

export const kv = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
