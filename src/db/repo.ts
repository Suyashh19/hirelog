import * as Crypto from 'expo-crypto';
import { sqlite } from './client';
import { computeAmount, hireCharge, isHire, resolveRate, isTimeBased, type HolidayCalendar, type Measure, type Rate, type RateUnit } from '../core/rate';
import { formatMoney } from '../core/money';
import { allocatePayments } from '../core/ledger';
import { isClockTampered } from '../core/tamper';
import { cleanGstin, gstSplit, meterHours } from '../core/gst';
import { region, setRegion } from '../core/region';
import { setLang } from '../i18n';

export const uuid = () => Crypto.randomUUID();
export const now = () => Date.now();

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function camelRow<T>(row: Record<string, unknown>): T {
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(row)) o[toCamel(k)] = row[k];
  return o as T;
}
export function all<T>(sql: string, params: (string | number | null)[] = []): T[] {
  return sqlite.getAllSync<Record<string, unknown>>(sql, params).map((r) => camelRow<T>(r));
}
export function one<T>(sql: string, params: (string | number | null)[] = []): T | null {
  const r = sqlite.getFirstSync<Record<string, unknown>>(sql, params);
  return r ? camelRow<T>(r) : null;
}

/** Transaction that is safe to nest: only the outermost call opens one. */
let txDepth = 0;
function tx<T>(fn: () => T): T {
  if (txDepth > 0) return fn();
  txDepth++;
  try {
    let out!: T;
    sqlite.withTransactionSync(() => { out = fn(); });
    return out;
  } finally {
    txDepth--;
  }
}

/** Insert-or-replace a row and queue it for sync, in one transaction. Local-only columns are skipped for the outbox. */
// pauseStartedAt only matters on this phone; confirmation fields are written by the customer's page on the server
const LOCAL_ONLY = new Set(['pauseStartedAt', 'confirmationStatus', 'confirmationNote', 'confirmedAt']);
export function save(table: string, row: Record<string, unknown>) {
  const stamped: Record<string, any> = { ...row, updatedAt: now() };
  const keys = Object.keys(stamped);
  const cols = keys.map(toSnake);
  const vals = keys.map((k) => (stamped[k] === undefined ? null : (stamped[k] as string | number | null)));
  const payload: Record<string, unknown> = {};
  for (const k of keys) if (!LOCAL_ONLY.has(k)) payload[toSnake(k)] = stamped[k] ?? null;
  tx(() => {
    sqlite.runSync(
      `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      vals,
    );
    sqlite.runSync(
      'INSERT INTO outbox (table_name,row_id,op,payload,created_at) VALUES (?,?,?,?,?)',
      [table, String(stamped.id), 'upsert', JSON.stringify(payload), now()],
    );
  });
  bump();
}

export function softDelete(table: string, id: string) {
  const t = now();
  tx(() => {
    sqlite.runSync(`UPDATE ${table} SET deleted_at=?, updated_at=? WHERE id=?`, [t, t, id]);
    sqlite.runSync('INSERT INTO outbox (table_name,row_id,op,payload,created_at) VALUES (?,?,?,?,?)', [
      table, id, 'delete', JSON.stringify({ id, deleted_at: t, updated_at: t }), t,
    ]);
  });
  bump();
}
export function restore(table: string, id: string) {
  const t = now();
  sqlite.runSync(`UPDATE ${table} SET deleted_at=NULL, updated_at=? WHERE id=?`, [t, id]);
  sqlite.runSync('INSERT INTO outbox (table_name,row_id,op,payload,created_at) VALUES (?,?,?,?,?)', [
    table, id, 'upsert', JSON.stringify({ id, deleted_at: null, updated_at: t }), t,
  ]);
  bump();
}

// ---- change notification (screens re-query when this counter changes) ----
let version = 0;
const listeners = new Set<() => void>();
export const bump = () => {
  version++;
  listeners.forEach((l) => l());
};
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getVersion = () => version;

// ---- types ----
export interface Workspace {
  id: string; name: string; template: string; phone: string | null; address: string | null; upiId: string | null;
  holidayWeekdays: string | null; holidayDates: string | null;
  gstin: string | null; gstRate: number | null; invoicePrefix: string | null; paymentTermsDays: number | null;
  country: string | null; distanceUnit: string | null; payLink: string | null; lang: string | null; reminderDays: string | null;
}
export interface Resource {
  id: string; workspaceId: string; name: string; kind: string; identifier: string | null; isActive: number; meterReading: number | null;
}
export interface Customer {
  id: string; workspaceId: string; name: string; phone: string | null; area: string | null; openingBalancePaise: number; gstin: string | null;
  tdsRate: number | null;
}
export interface CustomerWithBalance extends Customer { balancePaise: number; oldestUnpaidAt: number | null }
export interface Entry {
  id: string; workspaceId: string; resourceId: string; customerId: string | null; siteId: string | null; rateId: string | null;
  variantName: string | null; startedAt: number; endedAt: number | null; breakSeconds: number; pauseStartedAt: number | null;
  billableSeconds: number; quantity: number | null; unit: RateUnit; rateSnapshot: string | null; amountPaise: number;
  status: 'running' | 'done' | 'billed'; source: 'live' | 'manual' | 'adjusted' | 'edited';
  deviceUptimeStart: number | null; deviceUptimeEnd: number | null; tamperFlag: number; billId: string | null; note: string | null;
  deletedAt: number | null; meterStart: number | null; meterEnd: number | null; gpsKm: number | null;
  confirmToken: string | null; confirmationStatus: string | null; confirmationNote: string | null; confirmedAt: number | null;
  gpsFrom: string | null; gpsTo: string | null; operatorName: string | null;
}
export interface EntryRow extends Entry { resourceName: string; customerName: string | null; siteName: string | null; itemsPaise: number }
export interface Bill {
  id: string; customerId: string; number: number; periodFrom: number; periodTo: number; subtotalPaise: number;
  previousBalancePaise: number; totalPaise: number; status: 'draft' | 'sent' | 'partly_paid' | 'paid'; sentAt: number | null; updatedAt: number;
  taxPaise: number; gstRate: number | null; igst: number; dueAt: number | null; tdsPaise: number; tdsRate: number | null;
}
export interface Payment { id: string; customerId: string; billId: string | null; amountPaise: number; method: string; receivedAt: number; note: string | null }

// ---- workspace ----
/** The business. Reading it also applies its country (currency, tax name, km/miles) to the money helpers. */
export function getWorkspace() {
  const w = one<Workspace>('SELECT * FROM workspaces LIMIT 1');
  setRegion(w?.country ?? 'IN', w?.distanceUnit);
  setLang(w?.lang);
  return w;
}

export function createWorkspace(w: { name: string; template: string; phone?: string; upiId?: string; country?: string; lang?: string }) {
  const id = uuid();
  const t = now();
  sqlite.runSync(
    'INSERT INTO workspaces (id,name,template,phone,upi_id,country,lang,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, w.name, w.template, w.phone ?? null, w.upiId ?? null, w.country ?? 'IN', w.lang ?? null, t, t],
  );
  bump();
  return id;
}
export function updateWorkspace(
  id: string,
  patch: Partial<Pick<Workspace, 'name' | 'phone' | 'address' | 'upiId' | 'template' | 'holidayWeekdays' | 'holidayDates'
    | 'gstin' | 'gstRate' | 'invoicePrefix' | 'paymentTermsDays' | 'country' | 'distanceUnit' | 'payLink' | 'lang' | 'reminderDays'>>,
) {
  const cur = getWorkspace();
  if (!cur) return;
  const m = { ...cur, ...patch };
  sqlite.runSync(
    `UPDATE workspaces SET name=?,phone=?,address=?,upi_id=?,template=?,holiday_weekdays=?,holiday_dates=?,
       gstin=?,gst_rate=?,invoice_prefix=?,payment_terms_days=?,country=?,distance_unit=?,pay_link=?,lang=?,reminder_days=?,updated_at=? WHERE id=?`,
    [m.name, m.phone, m.address, m.upiId, m.template, m.holidayWeekdays ?? null, m.holidayDates ?? null,
      m.gstin ?? null, m.gstRate ?? null, m.invoicePrefix ?? null, m.paymentTermsDays ?? null,
      m.country ?? 'IN', m.distanceUnit ?? null, m.payLink ?? null, m.lang ?? null, m.reminderDays ?? null, now(), id],
  );
  setRegion(m.country ?? 'IN', m.distanceUnit);
  setLang(m.lang);
  bump();
}

/** "INV-" + 12 -> "INV-12"; without a prefix just "12". */
export const billLabel = (ws: Pick<Workspace, 'invoicePrefix'> | null, n: number) => `${ws?.invoicePrefix ?? ''}${n}`;

/** RS-5: the business's holidays (weekly off-days and dates). */
export function holidayCalendar(ws: Workspace | null = getWorkspace()): HolidayCalendar {
  const split = (s: string | null | undefined) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
  return {
    weekdays: split(ws?.holidayWeekdays).map(Number).filter((n) => n >= 0 && n <= 6),
    dates: split(ws?.holidayDates),
  };
}

// ---- resources & rates ----
export const listResources = () =>
  all<Resource>('SELECT * FROM resources WHERE deleted_at IS NULL AND is_active=1 ORDER BY name');

export function addResource(wsId: string, name: string, kind = 'self', meterReading: number | null = null) {
  const id = uuid();
  save('resources', { id, workspaceId: wsId, name, kind, identifier: null, isActive: 1, meterReading, deletedAt: null });
  return id;
}
export const getResource = (id: string) => one<Resource>('SELECT * FROM resources WHERE id=?', [id]);
/** Machines bill by hour meter. */
export const usesMeter = (r: Pick<Resource, 'kind'> | null | undefined) => r?.kind === 'machine';

/**
 * Which reading this work needs, from the rate's unit and the resource: odometer (km rates),
 * hour meter (machines on an hourly rate), or none.
 */
export function readingKind(
  r: Pick<Resource, 'kind'> | null | undefined, unit: RateUnit | null | undefined, measure?: Measure | null,
): 'odometer' | 'hourmeter' | null {
  if (!unit) return null;
  // an explicit choice on the price wins
  if (measure === 'odometer') return 'odometer';
  if (measure === 'hourmeter') return 'hourmeter';
  if (measure) return null;
  // older prices without a choice: machines on an hourly price use their hours counter
  if (unit === 'hour' && usesMeter(r)) return 'hourmeter';
  return null;
}
export function setMeterReading(resourceId: string, reading: number) {
  const r = getResource(resourceId);
  if (r) save('resources', { ...r, meterReading: reading });
}

function rateFromRow(r: any): Rate {
  return {
    id: r.id, resourceId: r.resourceId, customerId: r.customerId, variantName: r.variantName, unit: r.unit,
    amountPaise: r.amountPaise, minSeconds: r.minSeconds, roundingSeconds: r.roundingSeconds,
    overtimeAfterSeconds: r.overtimeAfterSeconds, overtimeAmountPaise: r.overtimeAmountPaise, visitChargePaise: r.visitChargePaise,
    nightFromMin: r.nightFromMin ?? null, nightToMin: r.nightToMin ?? null, nightAmountPaise: r.nightAmountPaise ?? null,
    holidayAmountPaise: r.holidayAmountPaise ?? null, minQuantity: r.minQuantity ?? null, measure: r.measure ?? null,
    monthlyFeePaise: r.monthlyFeePaise ?? null, includedHours: r.includedHours ?? null,
  };
}
export const listRates = (): Rate[] => all<any>('SELECT * FROM rates WHERE deleted_at IS NULL').map(rateFromRow);

export function saveRate(wsId: string, r: Partial<Rate> & { unit: RateUnit; amountPaise: number }) {
  const id = r.id ?? uuid();
  save('rates', {
    id, workspaceId: wsId, resourceId: r.resourceId ?? null, customerId: r.customerId ?? null,
    variantName: r.variantName ?? null, unit: r.unit, amountPaise: r.amountPaise, minSeconds: r.minSeconds ?? 0,
    roundingSeconds: r.roundingSeconds ?? 0, overtimeAfterSeconds: r.overtimeAfterSeconds ?? null,
    overtimeAmountPaise: r.overtimeAmountPaise ?? null, visitChargePaise: r.visitChargePaise ?? 0,
    nightFromMin: r.nightFromMin ?? null, nightToMin: r.nightToMin ?? null, nightAmountPaise: r.nightAmountPaise ?? null,
    holidayAmountPaise: r.holidayAmountPaise ?? null, minQuantity: r.minQuantity ?? null, measure: r.measure ?? null,
    monthlyFeePaise: r.monthlyFeePaise ?? null, includedHours: r.includedHours ?? null, deletedAt: null,
  });
  return id;
}
export function deleteRate(id: string) { softDelete('rates', id); }

// ---- customers ----
const BALANCE_SQL = `
  c.opening_balance_paise
  + COALESCE((SELECT SUM(t.amount_paise) FROM time_entries t WHERE t.customer_id=c.id AND t.deleted_at IS NULL AND t.status<>'running'),0)
  + COALESCE((SELECT SUM(ROUND(i.amount_paise*i.quantity)) FROM entry_items i JOIN time_entries t ON t.id=i.entry_id
              WHERE t.customer_id=c.id AND t.deleted_at IS NULL AND i.deleted_at IS NULL AND t.status<>'running'),0)
  + COALESCE((SELECT SUM(b.tax_paise - b.tds_paise) FROM bills b WHERE b.customer_id=c.id AND b.deleted_at IS NULL),0)
  - COALESCE((SELECT SUM(p.amount_paise) FROM payments p WHERE p.customer_id=c.id AND p.deleted_at IS NULL),0)`;

export const listCustomers = () =>
  all<CustomerWithBalance>(
    `SELECT c.*, (${BALANCE_SQL}) AS balance_paise,
       (SELECT MIN(t.started_at) FROM time_entries t WHERE t.customer_id=c.id AND t.deleted_at IS NULL AND t.status<>'running') AS oldest_unpaid_at
     FROM customers c WHERE c.deleted_at IS NULL ORDER BY balance_paise DESC, c.name`,
  );
export const getCustomer = (id: string) =>
  one<CustomerWithBalance>(`SELECT c.*, (${BALANCE_SQL}) AS balance_paise, NULL AS oldest_unpaid_at FROM customers c WHERE c.id=?`, [id]);

export function addCustomer(wsId: string, c: {
  name: string; phone?: string | null; area?: string | null; openingBalancePaise?: number; gstin?: string | null; tdsRate?: number | null;
}) {
  const id = uuid();
  save('customers', {
    id, workspaceId: wsId, name: c.name, phone: c.phone ?? null, area: c.area ?? null,
    openingBalancePaise: c.openingBalancePaise ?? 0, gstin: c.gstin ?? null, tdsRate: c.tdsRate ?? null, deletedAt: null,
  });
  return id;
}

// ---- entries ----
export const listRunning = () =>
  all<EntryRow>(entrySelect("t.status='running'") + ' ORDER BY t.started_at DESC');

function entrySelect(where: string) {
  return `SELECT t.*, r.name AS resource_name, c.name AS customer_name, st.name AS site_name,
    COALESCE((SELECT SUM(ROUND(i.amount_paise*i.quantity)) FROM entry_items i WHERE i.entry_id=t.id AND i.deleted_at IS NULL),0) AS items_paise
    FROM time_entries t LEFT JOIN resources r ON r.id=t.resource_id LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN sites st ON st.id=t.site_id
    WHERE t.deleted_at IS NULL AND ${where}`;
}

export function listEntries(f: { customerId?: string; resourceId?: string; billed?: 'billed' | 'unbilled'; from?: number; to?: number; limit?: number } = {}) {
  const w: string[] = ["t.status<>'running'"];
  const p: (string | number)[] = [];
  if (f.customerId) { w.push('t.customer_id=?'); p.push(f.customerId); }
  if (f.resourceId) { w.push('t.resource_id=?'); p.push(f.resourceId); }
  if (f.billed === 'billed') w.push("t.status='billed'");
  if (f.billed === 'unbilled') w.push("t.status='done'");
  if (f.from !== undefined) { w.push('t.started_at>=?'); p.push(f.from); }
  if (f.to !== undefined) { w.push('t.started_at<?'); p.push(f.to); }
  return all<EntryRow>(entrySelect(w.join(' AND ')) + ` ORDER BY t.started_at DESC LIMIT ${f.limit ?? 500}`, p);
}
export const getEntry = (id: string) => one<EntryRow>(entrySelect('t.id=?'), [id]);
export const entryItemsFor = (id: string) =>
  all<{ id: string; description: string; quantity: number; amountPaise: number }>(
    'SELECT * FROM entry_items WHERE entry_id=? AND deleted_at IS NULL', [id]);

function snapshotFor(rate: Rate | null) {
  return rate ? JSON.stringify(rate) : null;
}
/** The matching rate, with the business's holidays attached when it has a holiday price (kept in the entry's snapshot). */
function pickRate(resourceId: string, customerId: string | null, variantName: string | null): Rate | null {
  const r = resolveRate(listRates(), { resourceId, customerId, variantName });
  if (r && r.holidayAmountPaise) return { ...r, holidays: holidayCalendar() };
  return r;
}

export function lastUsed(): { resourceId: string | null; customerId: string | null } {
  const r = one<{ resourceId: string; customerId: string | null }>(
    'SELECT resource_id, customer_id FROM time_entries WHERE deleted_at IS NULL ORDER BY started_at DESC LIMIT 1');
  return { resourceId: r?.resourceId ?? null, customerId: r?.customerId ?? null };
}

export function startTimer(
  wsId: string,
  a: {
    resourceId: string; customerId: string | null; siteId?: string | null; variantName?: string | null; uptimeMs: number | null; at?: number;
    meterStart?: number | null;
  },
) {
  const rate = pickRate(a.resourceId, a.customerId, a.variantName ?? null);
  const id = uuid();
  save('time_entries', {
    id, workspaceId: wsId, resourceId: a.resourceId, customerId: a.customerId, siteId: a.siteId ?? null,
    rateId: rate?.id ?? null, variantName: a.variantName ?? null, startedAt: a.at ?? now(), endedAt: null,
    breakSeconds: 0, pauseStartedAt: null, billableSeconds: 0, quantity: null, unit: rate?.unit ?? 'hour',
    rateSnapshot: snapshotFor(rate), amountPaise: 0, status: 'running', source: a.at ? 'adjusted' : 'live',
    deviceUptimeStart: a.uptimeMs, deviceUptimeEnd: null, tamperFlag: 0, billId: null, note: null, deletedAt: null,
    meterStart: a.meterStart ?? null, meterEnd: null, operatorName: operatorName(),
  });
  return id;
}

/** On a team member's phone: their name goes on every entry, so the owner sees who did the work. */
function operatorName(): string | null {
  try {
    const m = JSON.parse(kvGet('membership') ?? 'null');
    return m?.role === 'member' ? kvGet('member-name') : null;
  } catch {
    return null;
  }
}

/** Running entries store their start; elapsed is derived, so it survives app close / restart / no network. */
export function liveSeconds(e: Pick<Entry, 'startedAt' | 'breakSeconds' | 'pauseStartedAt'>, at = now()) {
  const pause = e.pauseStartedAt ? at - e.pauseStartedAt : 0;
  return Math.max(0, Math.floor((at - e.startedAt - pause) / 1000) - e.breakSeconds);
}
export function liveAmount(e: Entry, at = now()) {
  const snap: Rate | null = e.rateSnapshot ? JSON.parse(e.rateSnapshot) : null;
  if (!snap || !isTimeBased(snap.unit)) return 0;
  const pause = e.pauseStartedAt ? at - e.pauseStartedAt : 0;
  const worked = Math.floor((at - e.startedAt - pause) / 1000);
  return computeAmount(snap, { workedSeconds: worked, breakSeconds: e.breakSeconds, startedAt: e.startedAt }).amountPaise;
}

export function togglePause(id: string) {
  const e = getEntry(id);
  if (!e || e.status !== 'running') return;
  if (e.pauseStartedAt) {
    const add = Math.floor((now() - e.pauseStartedAt) / 1000);
    save('time_entries', { ...strip(e), breakSeconds: e.breakSeconds + add, pauseStartedAt: null });
  } else {
    save('time_entries', { ...strip(e), pauseStartedAt: now() });
  }
}

function strip(e: any) {
  const { resourceName, customerName, siteName, itemsPaise, ...row } = e;
  return row;
}

/** Back-date a running timer: "Started 15 min ago". Marks the entry as adjusted (TM-6). */
export function adjustStart(id: string, minutesAgo: number) {
  const e = getEntry(id);
  if (!e) return;
  save('time_entries', { ...strip(e), startedAt: e.startedAt - minutesAgo * 60000, source: 'adjusted' });
}

export function stopTimer(id: string, o: {
  uptimeMs: number | null; minutesAgo?: number; quantity?: number | null; note?: string | null; meterEnd?: number | null;
  items?: ItemInput[]; gpsKm?: number | null; gpsFrom?: string | null; gpsTo?: string | null;
}) {
  const e = getEntry(id);
  if (!e || e.status !== 'running') return null;
  const end = Math.max(e.startedAt, now() - (o.minutesAgo ?? 0) * 60000); // never stop before it started
  const pauseAdd = e.pauseStartedAt ? Math.floor((end - e.pauseStartedAt) / 1000) : 0;
  const brk = e.breakSeconds + Math.max(0, pauseAdd);
  const snap: Rate | null = e.rateSnapshot ? JSON.parse(e.rateSnapshot) : null;
  // Readings decide the work when both are known: hour meter -> hours (breaks do not apply), odometer -> km.
  const mh = meterHours(e.meterStart, o.meterEnd);
  const a = fromReadings(snap?.unit ?? 'hour', mh, Math.max(0, Math.floor((end - e.startedAt) / 1000)), brk, o.quantity ?? 1);
  const res = snap
    ? computeAmount(snap, { workedSeconds: a.worked, breakSeconds: a.brk, quantity: a.qty, startedAt: e.startedAt })
    : { billableSeconds: Math.max(0, a.worked - a.brk), quantity: 0, amountPaise: 0 };
  const tamper = e.source === 'live' && isClockTampered({
    wallStartMs: e.startedAt, wallEndMs: now(), uptimeStartMs: e.deviceUptimeStart, uptimeEndMs: o.uptimeMs,
  });
  const row = {
    ...strip(e), endedAt: end, breakSeconds: brk, pauseStartedAt: null, billableSeconds: res.billableSeconds,
    quantity: snap && !isTimeBased(snap.unit) ? res.quantity : res.quantity, amountPaise: res.amountPaise, status: 'done',
    source: o.minutesAgo ? 'adjusted' : e.source, deviceUptimeEnd: o.uptimeMs, tamperFlag: tamper ? 1 : e.tamperFlag,
    note: o.note ?? e.note, meterEnd: mh !== null ? o.meterEnd : e.meterEnd, gpsKm: o.gpsKm ?? e.gpsKm ?? null,
    gpsFrom: o.gpsFrom ?? e.gpsFrom ?? null, gpsTo: o.gpsTo ?? e.gpsTo ?? null,
  };
  tx(() => {
    save('time_entries', row);
    if (mh !== null && o.meterEnd != null) setMeterReading(e.resourceId, o.meterEnd);
    for (const it of o.items ?? []) addItem(e.workspaceId, id, it.description, it.amountPaise, it.quantity);
  });
  return id;
}

/**
 * Turns a reading difference into work: on a per-km rate it is the km; on an hourly rate it is the hours.
 * Without readings the clock and the typed quantity are used.
 */
function fromReadings(unit: RateUnit, diff: number | null, clockSecs: number, brk: number, qty: number) {
  if (diff === null) return { worked: clockSecs, brk, qty };
  if (unit === 'km') return { worked: clockSecs, brk, qty: diff };
  if (unit === 'hour') return { worked: Math.round(diff * 3600), brk: 0, qty };
  return { worked: clockSecs, brk, qty };
}

/** One material or extra-charge line: description, quantity and price for one unit. */
export interface ItemInput { description: string; quantity: number; amountPaise: number }

export interface ManualInput {
  resourceId: string; customerId: string | null; siteId?: string | null; variantName?: string | null;
  startedAt: number; workedSeconds: number; breakSeconds: number; quantity?: number | null; note?: string | null;
  items?: ItemInput[]; meterStart?: number | null; meterEnd?: number | null; visitOnly?: boolean;
}
export function previewManual(
  m: Pick<ManualInput, 'resourceId' | 'customerId' | 'variantName' | 'workedSeconds' | 'breakSeconds' | 'quantity' | 'meterStart' | 'meterEnd' | 'visitOnly'>
    & { startedAt?: number | null },
) {
  const rate = pickRate(m.resourceId, m.customerId, m.variantName ?? null);
  if (!rate) return { rate: null, billableSeconds: 0, quantity: 0, amountPaise: 0 };
  const a = fromReadings(rate.unit, meterHours(m.meterStart, m.meterEnd), m.workedSeconds, m.breakSeconds, m.quantity ?? 1);
  return {
    rate,
    ...computeAmount(rate, { workedSeconds: a.worked, breakSeconds: a.brk, quantity: a.qty, startedAt: m.startedAt, visitOnly: m.visitOnly }),
  };
}
export function addManualEntry(wsId: string, m: ManualInput) {
  const p = previewManual(m);
  const mh = meterHours(m.meterStart, m.meterEnd);
  const a = fromReadings(p.rate?.unit ?? 'hour', mh, m.workedSeconds, m.breakSeconds, m.quantity ?? 1);
  const worked = m.visitOnly ? 0 : a.worked;
  const id = uuid();
  tx(() => {
    save('time_entries', {
      id, workspaceId: wsId, resourceId: m.resourceId, customerId: m.customerId, siteId: m.siteId ?? null,
      rateId: p.rate?.id ?? null, variantName: m.variantName ?? null, startedAt: m.startedAt,
      endedAt: m.startedAt + worked * 1000, breakSeconds: m.visitOnly ? 0 : a.brk, pauseStartedAt: null,
      billableSeconds: p.billableSeconds, quantity: p.quantity, unit: p.rate?.unit ?? 'hour', rateSnapshot: snapshotFor(p.rate),
      amountPaise: p.amountPaise, status: 'done', source: 'manual', deviceUptimeStart: null, deviceUptimeEnd: null,
      tamperFlag: 0, billId: null, note: m.visitOnly ? (m.note ? `Visit only · ${m.note}` : 'Visit only') : m.note ?? null, deletedAt: null,
      meterStart: mh !== null ? m.meterStart : null, meterEnd: mh !== null ? m.meterEnd : null, operatorName: operatorName(),
    });
    for (const it of m.items ?? []) addItem(wsId, id, it.description, it.amountPaise, it.quantity);
    // keep the machine's meter current if this reading is the latest
    if (mh !== null && m.meterEnd != null) {
      const r = getResource(m.resourceId);
      if (r && (r.meterReading == null || m.meterEnd > r.meterReading)) setMeterReading(m.resourceId, m.meterEnd);
    }
  });
  return id;
}
export function addItem(wsId: string, entryId: string, description: string, amountPaise: number, quantity = 1) {
  if (!description.trim() || !amountPaise || !(quantity > 0)) return;
  save('entry_items', { id: uuid(), workspaceId: wsId, entryId, description: description.trim(), quantity, amountPaise, deletedAt: null });
}
export function deleteItem(id: string) { softDelete('entry_items', id); }

/** Materials used before, newest first, with the last price, for one-tap reuse. */
export function recentItems(limit = 8): { description: string; amountPaise: number }[] {
  // SQLite returns the other columns from the row that holds MAX(), i.e. the latest price for each description
  return all<{ description: string; amountPaise: number }>(
    `SELECT description, amount_paise, MAX(updated_at) AS last FROM entry_items WHERE deleted_at IS NULL
     GROUP BY description ORDER BY last DESC LIMIT ?`, [limit]);
}

/** EN-5: edits keep history; billed entries are locked, so a change becomes a separate adjustment entry. */
export function editEntry(id: string, patch: { note?: string | null; customerId?: string | null; startedAt?: number; workedSeconds?: number; breakSeconds?: number; quantity?: number | null }) {
  const e = getEntry(id);
  if (!e || e.status === 'billed' || e.status === 'running') return false;
  sqlite.runSync('INSERT INTO entry_history (id,entry_id,at,before) VALUES (?,?,?,?)', [uuid(), id, now(), JSON.stringify(strip(e))]);
  const started = patch.startedAt ?? e.startedAt;
  const customerId = patch.customerId === undefined ? e.customerId : patch.customerId;
  const rate = pickRate(e.resourceId, customerId, e.variantName);
  const clock = Math.floor(((e.endedAt ?? e.startedAt) - e.startedAt) / 1000);
  // readings stay in charge unless the user typed a new time or quantity
  const a = fromReadings(rate?.unit ?? e.unit, meterHours(e.meterStart, e.meterEnd), clock, e.breakSeconds, e.quantity ?? 1);
  const worked = patch.workedSeconds ?? a.worked;
  const brk = patch.breakSeconds ?? (patch.workedSeconds === undefined ? a.brk : e.breakSeconds);
  const qty = patch.quantity ?? a.qty;
  const res = rate ? computeAmount(rate, { workedSeconds: worked, breakSeconds: brk, quantity: qty, startedAt: started }) : null;
  save('time_entries', {
    ...strip(e), customerId, startedAt: started, endedAt: started + worked * 1000, breakSeconds: brk,
    billableSeconds: res?.billableSeconds ?? e.billableSeconds, quantity: res?.quantity ?? e.quantity,
    amountPaise: res?.amountPaise ?? e.amountPaise, rateId: rate?.id ?? e.rateId, rateSnapshot: rate ? snapshotFor(rate) : e.rateSnapshot,
    note: patch.note === undefined ? e.note : patch.note, source: 'edited',
  });
  return true;
}
export const entryHistory = (id: string) =>
  all<{ id: string; at: number; before: string }>('SELECT * FROM entry_history WHERE entry_id=? ORDER BY at DESC', [id]);

export function addAdjustment(wsId: string, original: Entry, amountPaise: number, note: string) {
  const id = uuid();
  save('time_entries', {
    id, workspaceId: wsId, resourceId: original.resourceId, customerId: original.customerId, siteId: original.siteId,
    rateId: null, variantName: null, startedAt: now(), endedAt: now(), breakSeconds: 0, pauseStartedAt: null,
    billableSeconds: 0, quantity: null, unit: 'job', rateSnapshot: null, amountPaise, status: 'done', source: 'adjusted',
    deviceUptimeStart: null, deviceUptimeEnd: null, tamperFlag: 0, billId: null, note: `Adjustment: ${note}`, deletedAt: null,
  });
  return id;
}

export function deleteEntry(id: string) {
  const e = getEntry(id);
  if (!e || e.status === 'billed') return false;
  softDelete('time_entries', id);
  return true;
}
export const undeleteEntry = (id: string) => restore('time_entries', id);

// ---- bills ----
export function unbilledFor(customerId: string, from: number, to: number) {
  return listEntries({ customerId, billed: 'unbilled', from, to });
}
export const entryTotal = (e: { amountPaise: number; itemsPaise: number }) => e.amountPaise + e.itemsPaise;

function nextBillNumber() {
  return (one<{ n: number }>('SELECT COALESCE(MAX(number),0)+1 AS n FROM bills')?.n) ?? 1;
}

/** BL-1: creates a draft bill from unbilled entries and locks them. Returns null if there is nothing to bill. */
/**
 * BL-1: creates a draft bill from unbilled entries and locks them. Returns null if there is nothing to bill.
 * With `gst` (Business plan, and the business has a GSTIN) it becomes a tax invoice: GST is added on top of the work.
 */
export function createBill(wsId: string, customerId: string, from: number, to: number, entryIds?: string[], opts: { gst?: boolean } = {}) {
  let entries = unbilledFor(customerId, from, to);
  if (entryIds) entries = entries.filter((e) => entryIds.includes(e.id));
  if (!entries.length) return null;
  const cust = getCustomer(customerId);
  if (!cust) return null;
  const ws = getWorkspace();
  const workTotal = entries.reduce((s, e) => s + entryTotal(e), 0);
  // Monthly hire prices: their entries carry hours only; one line per hire price adds the fee + extra hours
  const hireGroups = new Map<string, { rate: Rate; secs: number; resourceId: string; siteId: string | null }>();
  for (const e of entries) {
    const snap: Rate | null = e.rateSnapshot ? JSON.parse(e.rateSnapshot) : null;
    if (!snap || !isHire(snap)) continue;
    const k = snap.id;
    const g = hireGroups.get(k) ?? { rate: snap, secs: 0, resourceId: e.resourceId, siteId: e.siteId };
    g.secs += e.billableSeconds;
    hireGroups.set(k, g);
  }
  const hireLines = [...hireGroups.values()].map((g) => {
    const c = hireCharge(g.secs, g.rate.monthlyFeePaise!, g.rate.includedHours ?? 0, g.rate.amountPaise);
    const note = `Monthly hire: ${c.hours} h used, ${g.rate.includedHours ?? 0} h included${c.extraHours ? `, ${c.extraHours} h extra × ${formatMoney(g.rate.amountPaise)}` : ''}`;
    return { ...g, charge: c, note };
  });
  const hireTotal = hireLines.reduce((s, h) => s + h.charge.totalPaise, 0);
  const subtotal = workTotal + hireTotal;
  const prev = cust.balancePaise - workTotal; // balance has neither this bill's hire fee nor its tax yet
  const reg = region();
  const rate = ws?.gstRate ?? reg.defaultTaxRate;
  let tax = 0;
  let igst = 0; // 0 = CGST+SGST (India), 1 = IGST (India), 2 = one tax line abroad (VAT, GST, sales tax)
  if (opts.gst && reg.splitTax) {
    const seller = cleanGstin(ws?.gstin);
    const g = seller ? gstSplit(subtotal, rate, seller, cust.gstin) : null;
    tax = g?.taxPaise ?? 0;
    igst = g?.interState ? 1 : 0;
  } else if (opts.gst && (ws?.gstin ?? '').trim() && rate > 0) {
    tax = Math.round((subtotal * rate) / 100);
    igst = 2;
  }
  // TDS (India): the client keeps this % of the work and pays it to the government for you
  const tdsRate = reg.code === 'IN' ? cust.tdsRate ?? 0 : 0;
  const tds = tdsRate > 0 ? Math.round((subtotal * tdsRate) / 100) : 0;
  const terms = ws?.paymentTermsDays ?? null;
  const id = uuid();
  tx(() => {
    save('bills', {
      id, workspaceId: wsId, customerId, number: nextBillNumber(), periodFrom: from, periodTo: to,
      subtotalPaise: subtotal, previousBalancePaise: prev, totalPaise: subtotal + tax - tds + prev, status: 'draft', sentAt: null, deletedAt: null,
      taxPaise: tax, gstRate: tax ? rate : null, igst, dueAt: terms ? now() + terms * 86400000 : null,
      tdsPaise: tds, tdsRate: tds ? tdsRate : null,
    });
    for (const e of entries) save('time_entries', { ...strip(e), status: 'billed', billId: id });
    for (const h of hireLines) {
      save('time_entries', {
        id: uuid(), workspaceId: wsId, resourceId: h.resourceId, customerId, siteId: h.siteId, rateId: h.rate.id, variantName: h.rate.variantName,
        startedAt: to - 1, endedAt: to - 1, breakSeconds: 0, pauseStartedAt: null, billableSeconds: 0, quantity: 1, unit: 'job',
        rateSnapshot: null, amountPaise: h.charge.totalPaise, status: 'billed', source: 'manual', deviceUptimeStart: null, deviceUptimeEnd: null,
        tamperFlag: 0, billId: id, note: h.note, deletedAt: null,
      });
    }
  });
  return id;
}
export const listBills = () =>
  all<Bill & { customerName: string }>(
    `SELECT b.*, c.name AS customer_name FROM bills b JOIN customers c ON c.id=b.customer_id
     WHERE b.deleted_at IS NULL ORDER BY b.number DESC`);
export const getBill = (id: string) =>
  one<Bill & { customerName: string; customerPhone: string | null; customerGstin: string | null; customerArea: string | null }>(
    `SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.gstin AS customer_gstin, c.area AS customer_area
     FROM bills b JOIN customers c ON c.id=b.customer_id WHERE b.id=?`, [id]);
export const billEntries = (billId: string) => all<EntryRow>(entrySelect('t.bill_id=?') + ' ORDER BY t.started_at', [billId]);
export const billItems = (billId: string) =>
  all<{ description: string; amountPaise: number; quantity: number }>(
    `SELECT i.* FROM entry_items i JOIN time_entries t ON t.id=i.entry_id WHERE t.bill_id=? AND i.deleted_at IS NULL`, [billId]);

export function markBillSent(id: string) {
  const b = getBill(id);
  if (!b || b.status !== 'draft') return;
  save('bills', { ...stripBill(b), status: 'sent', sentAt: now() });
  reallocate(b.customerId);
}
function stripBill(b: any) {
  const { customerName, customerPhone, customerGstin, customerArea, ...row } = b;
  return { ...row, workspaceId: row.workspaceId ?? getWorkspace()!.id, deletedAt: null };
}
export function deleteDraftBill(id: string) {
  const b = getBill(id);
  if (!b || b.status !== 'draft') return false;
  tx(() => {
    for (const e of billEntries(id)) {
      // the bill's own "Monthly hire" line goes away; real work goes back to unbilled
      if (!e.rateSnapshot && e.note?.startsWith('Monthly hire:')) softDelete('time_entries', e.id);
      else save('time_entries', { ...strip(e), status: 'done', billId: null });
    }
    softDelete('bills', id);
  });
  return true;
}

// ---- payments ----
export function addPayment(wsId: string, p: { customerId: string; amountPaise: number; method: string; receivedAt?: number; note?: string | null; billId?: string | null }) {
  const id = uuid();
  save('payments', {
    id, workspaceId: wsId, customerId: p.customerId, billId: p.billId ?? null, amountPaise: p.amountPaise,
    method: p.method, receivedAt: p.receivedAt ?? now(), note: p.note ?? null, deletedAt: null,
  });
  reallocate(p.customerId);
  return id;
}
export function deletePayment(id: string) {
  const p = one<Payment>('SELECT * FROM payments WHERE id=?', [id]);
  softDelete('payments', id);
  if (p) reallocate(p.customerId);
}
export const listPayments = (customerId: string) =>
  all<Payment>('SELECT * FROM payments WHERE customer_id=? AND deleted_at IS NULL ORDER BY received_at DESC', [customerId]);

/** BL-8: bill status follows payments (oldest bills are paid first). */
function reallocate(customerId: string) {
  const cust = getCustomer(customerId);
  if (!cust) return;
  const paid = one<{ s: number }>('SELECT COALESCE(SUM(amount_paise),0) AS s FROM payments WHERE customer_id=? AND deleted_at IS NULL', [customerId])!.s;
  const bills = all<Bill>('SELECT * FROM bills WHERE customer_id=? AND deleted_at IS NULL', [customerId]);
  const result = allocatePayments(cust.openingBalancePaise, paid, bills.map((b) => ({
    id: b.id, subtotalPaise: b.subtotalPaise + (b.taxPaise ?? 0) - (b.tdsPaise ?? 0), sortKey: b.number, status: b.status,
  })));
  for (const b of bills) {
    const s = result[b.id];
    if (s && s !== b.status) save('bills', { ...stripBill(b), status: s });
  }
}

// ---- ledger timeline ----
export type LedgerItem =
  | { kind: 'entry'; at: number; entry: EntryRow }
  | { kind: 'bill'; at: number; bill: Bill }
  | { kind: 'payment'; at: number; payment: Payment };
export function ledger(customerId: string): LedgerItem[] {
  const items: LedgerItem[] = [
    ...listEntries({ customerId }).map((entry) => ({ kind: 'entry' as const, at: entry.startedAt, entry })),
    ...all<Bill>('SELECT * FROM bills WHERE customer_id=? AND deleted_at IS NULL', [customerId]).map((bill) => ({ kind: 'bill' as const, at: bill.updatedAt, bill })),
    ...listPayments(customerId).map((payment) => ({ kind: 'payment' as const, at: payment.receivedAt, payment })),
  ];
  return items.sort((a, b) => b.at - a.at);
}

// ---- reports ----
export function summary(from: number, to: number) {
  const t = one<{ secs: number; earned: number }>(
    `SELECT COALESCE(SUM(billable_seconds),0) AS secs, COALESCE(SUM(amount_paise),0) AS earned
     FROM time_entries WHERE deleted_at IS NULL AND status<>'running' AND started_at>=? AND started_at<?`, [from, to])!;
  const items = one<{ s: number }>(
    `SELECT COALESCE(SUM(ROUND(i.amount_paise*i.quantity)),0) AS s FROM entry_items i JOIN time_entries t ON t.id=i.entry_id
     WHERE i.deleted_at IS NULL AND t.deleted_at IS NULL AND t.status<>'running' AND t.started_at>=? AND t.started_at<?`, [from, to])!.s;
  const collected = one<{ s: number }>(
    'SELECT COALESCE(SUM(amount_paise),0) AS s FROM payments WHERE deleted_at IS NULL AND received_at>=? AND received_at<?', [from, to])!.s;
  const pending = listCustomers().reduce((s, c) => s + Math.max(0, c.balancePaise), 0);
  return { seconds: t.secs, earnedPaise: t.earned + items, collectedPaise: collected, pendingPaise: pending };
}
export const byCustomer = (from: number, to: number) =>
  all<{ name: string; secs: number; earned: number }>(
    `SELECT COALESCE(c.name,'No customer') AS name, SUM(t.billable_seconds) AS secs, SUM(t.amount_paise) AS earned
     FROM time_entries t LEFT JOIN customers c ON c.id=t.customer_id
     WHERE t.deleted_at IS NULL AND t.status<>'running' AND t.started_at>=? AND t.started_at<? GROUP BY name ORDER BY earned DESC`, [from, to]);
export const byResource = (from: number, to: number) =>
  all<{ name: string; secs: number; earned: number }>(
    `SELECT r.name AS name, SUM(t.billable_seconds) AS secs, SUM(t.amount_paise) AS earned
     FROM time_entries t JOIN resources r ON r.id=t.resource_id
     WHERE t.deleted_at IS NULL AND t.status<>'running' AND t.started_at>=? AND t.started_at<? GROUP BY name ORDER BY earned DESC`, [from, to]);

// ---- insights (Home nudges and the Insights screen) ----
const DAY = 86400000;
const dayStartMs = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** Earned (work + extra charges) per local day for `days` days starting at `fromDay`. */
export function earningsByDay(fromDay: number, days: number): number[] {
  const s = new Date(dayStartMs(fromDay));
  // calendar-day boundaries (not fixed 24h), so buckets stay right across clock changes
  const edges = Array.from({ length: days + 1 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i).getTime());
  const rows = all<{ startedAt: number; total: number }>(
    `SELECT t.started_at, t.amount_paise + COALESCE((SELECT SUM(ROUND(i.amount_paise*i.quantity)) FROM entry_items i WHERE i.entry_id=t.id AND i.deleted_at IS NULL),0) AS total
     FROM time_entries t WHERE t.deleted_at IS NULL AND t.status<>'running' AND t.started_at>=? AND t.started_at<?`, [edges[0], edges[days]]);
  const out = new Array(days).fill(0);
  for (const r of rows) {
    let i = 0;
    while (i < days - 1 && r.startedAt >= edges[i + 1]) i++;
    out[i] += r.total;
  }
  return out;
}

/** Work that is done but not on any bill yet: the money you could ask for today. */
export function unbilledSummary() {
  const r = one<{ total: number; n: number; oldest: number | null; customers: number }>(
    `SELECT COALESCE(SUM(t.amount_paise + COALESCE((SELECT SUM(ROUND(i.amount_paise*i.quantity)) FROM entry_items i WHERE i.entry_id=t.id AND i.deleted_at IS NULL),0)),0) AS total,
            COUNT(*) AS n, MIN(t.started_at) AS oldest, COUNT(DISTINCT t.customer_id) AS customers
     FROM time_entries t WHERE t.deleted_at IS NULL AND t.status='done' AND t.customer_id IS NOT NULL`)!;
  return { totalPaise: r.total, entries: r.n, oldestAt: r.oldest, customers: r.customers };
}

/** Customers whose oldest unpaid work is older than `days` days, with what they owe. */
export function overdueSummary(days = 15) {
  const cutoff = now() - days * DAY;
  const list = listCustomers().filter((c) => c.balancePaise > 0 && c.oldestUnpaidAt !== null && c.oldestUnpaidAt < cutoff);
  return { customers: list.length, totalPaise: list.reduce((s, c) => s + c.balancePaise, 0) };
}

/** Hours of time-based work and what they earned, for the real "per hour" figure. */
export function hourlyStats(from: number, to: number) {
  const r = one<{ secs: number; earned: number }>(
    `SELECT COALESCE(SUM(billable_seconds),0) AS secs, COALESCE(SUM(amount_paise),0) AS earned
     FROM time_entries WHERE deleted_at IS NULL AND status<>'running' AND unit='hour' AND started_at>=? AND started_at<?`, [from, to])!;
  return { seconds: r.secs, perHourPaise: r.secs > 0 ? Math.round(r.earned / (r.secs / 3600)) : 0 };
}

/** Money billed in a period and how much of all billed money has been received. */
export function billedStats(from: number, to: number) {
  const billed = one<{ s: number }>(
    'SELECT COALESCE(SUM(subtotal_paise),0) AS s FROM bills WHERE deleted_at IS NULL AND status<>\'draft\' AND updated_at>=? AND updated_at<?', [from, to])!.s;
  const counts = one<{ paid: number; total: number }>(
    "SELECT SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid, COUNT(*) AS total FROM bills WHERE deleted_at IS NULL AND status<>'draft'")!;
  return { billedPaise: billed, paidBills: counts.paid ?? 0, sentBills: counts.total ?? 0 };
}

/** Monthly income goal (kept on this phone). */
export const getIncomeGoal = (): number => parseInt(kvGet('income-goal') ?? '0', 10) || 0;
export const setIncomeGoal = (paise: number) => { kvSet('income-goal', String(Math.max(0, Math.round(paise)))); bump(); };

export const kvGet = (k: string) => one<{ value: string }>('SELECT value FROM kv WHERE key=?', [k])?.value ?? null;
export const kvSet = (k: string, v: string) => sqlite.runSync('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)', [k, v]);

// ---- edit / remove ----
export function updateCustomer(id: string, patch: { name: string; phone: string | null; area: string | null; gstin?: string | null; tdsRate?: number | null }) {
  const c = one<Customer>('SELECT * FROM customers WHERE id=?', [id]);
  if (c) save('customers', { ...c, ...patch });
}
/** Customers with money outstanding (or credit) cannot be removed; their history stays intact either way. */
export function deleteCustomer(id: string): { ok: boolean; reason?: string } {
  const c = getCustomer(id);
  if (!c) return { ok: false, reason: 'Not found' };
  if (c.balancePaise !== 0) return { ok: false, reason: 'This customer still has a balance. Record the payment first.' };
  softDelete('customers', id);
  return { ok: true };
}
/** Removes a resource from lists and from the plan limit; entries and bills that used it are kept. */
export function archiveResource(id: string) {
  const r = one<Resource>('SELECT * FROM resources WHERE id=?', [id]);
  if (r) save('resources', { ...r, isActive: 0 });
}
export function hasRunning(resourceId: string) {
  return !!one('SELECT 1 AS x FROM time_entries WHERE resource_id=? AND status=? AND deleted_at IS NULL', [resourceId, 'running']);
}

// ---- sites / projects under a customer (CU-2) ----
export interface Site { id: string; customerId: string; name: string }
export const listSites = (customerId: string) =>
  all<Site>('SELECT * FROM sites WHERE customer_id=? AND deleted_at IS NULL ORDER BY name', [customerId]);
export function addSite(wsId: string, customerId: string, name: string) {
  const id = uuid();
  save('sites', { id, workspaceId: wsId, customerId, name, deletedAt: null });
  return id;
}
export const deleteSite = (id: string) => softDelete('sites', id);

// ---- rate variants (RS-3): named prices for one resource, e.g. "AC repair" vs "Wiring" ----
export const listVariants = (resourceId: string): string[] =>
  all<{ variantName: string }>(
    "SELECT DISTINCT variant_name FROM rates WHERE resource_id=? AND customer_id IS NULL AND variant_name IS NOT NULL AND deleted_at IS NULL ORDER BY variant_name",
    [resourceId],
  ).map((r) => r.variantName);
