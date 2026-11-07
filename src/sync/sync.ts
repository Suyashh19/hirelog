import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';
import { sqlite } from '../db/client';
import { supabase } from '../cloud';
import { all, bump, getWorkspace, kvGet, kvSet, one, subscribe } from '../db/repo';
import { setPlan } from '../billing/plan';
import { toLocal, toRemote } from './convert';
import { isDeadSession } from '../data/session';
import { isOperator, refreshMembership } from '../data/membership';

/**
 * Outbox sync (PRD section 9): local SQLite is the source of truth.
 *  push: outbox rows -> Supabase, oldest first, batches of up to 100 (per table, consecutive).
 *  pull: server rows with updated_at > last pulled -> local (rows with pending local changes are skipped).
 *  conflicts: last write wins per row; the server stamps updated_at.
 */
const TABLES = ['resources', 'rates', 'customers', 'sites', 'bills', 'time_entries', 'entry_items', 'payments', 'quotes', 'expenses'];

type Row = Record<string, any>;
interface OutboxRow { seq: number; tableName: string; rowId: string; op: string; payload: string }

const colCache = new Map<string, Set<string>>();
function localCols(table: string) {
  let c = colCache.get(table);
  if (!c) {
    c = new Set(sqlite.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name));
    colCache.set(table, c);
  }
  return c;
}

// ---- status ----
export type SyncState = 'signedout' | 'idle' | 'syncing' | 'synced' | 'offline' | 'blocked' | 'error';
let status: { state: SyncState; message: string | null; at: number | null } = { state: 'signedout', message: null, at: null };
const sl = new Set<() => void>();
const setStatus = (state: SyncState, message: string | null = null) => {
  status = { state, message, at: state === 'synced' ? Date.now() : status.at };
  sl.forEach((l) => l());
};
export const useSyncStatus = () => useSyncExternalStore((l) => (sl.add(l), () => sl.delete(l)), () => status);
export const pendingCount = () => one<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n ?? 0;

// ---- workspace bootstrap ----
async function ensureCloudWorkspace(userId: string) {
  const ws = getWorkspace();
  if (!ws) return;
  // Operators on someone else's business never write the business record (only the owner/managers can)
  if (isOperator()) return;
  const sig = JSON.stringify([userId, ws.name, ws.template, ws.phone, ws.address, ws.upiId, ws.holidayWeekdays, ws.holidayDates,
    ws.gstin, ws.gstRate, ws.invoicePrefix, ws.paymentTermsDays, ws.country, ws.distanceUnit, ws.payLink, ws.lang, ws.reminderDays]);
  if (kvGet('ws-pushed') === sig) return;
  const p = await supabase.from('profiles').upsert({ id: userId });
  if (p.error) throw p.error;
  const w = await supabase.from('workspaces').upsert({
    id: ws.id, name: ws.name, owner_id: userId, template: ws.template, phone: ws.phone, address: ws.address, upi_id: ws.upiId,
    holiday_weekdays: ws.holidayWeekdays, holiday_dates: ws.holidayDates,
    gstin: ws.gstin, gst_rate: ws.gstRate, invoice_prefix: ws.invoicePrefix, payment_terms_days: ws.paymentTermsDays,
    country: ws.country, distance_unit: ws.distanceUnit, pay_link: ws.payLink, lang: ws.lang, reminder_days: ws.reminderDays,
  });
  if (w.error) throw w.error;
  const m = await supabase.from('workspace_members').upsert(
    { workspace_id: ws.id, user_id: userId, role: 'owner', can_see_amounts: true },
    { onConflict: 'workspace_id,user_id', ignoreDuplicates: true },
  );
  if (m.error) throw m.error;
  kvSet('ws-pushed', sig);
}

/** On a fresh device: adopt the user's cloud business (or the one with this id, after joining a team). */
export async function adoptCloudWorkspace(wsId?: string): Promise<boolean> {
  if (getWorkspace()) return true;
  const q = supabase.from('workspaces').select('*');
  const { data, error } = await (wsId ? q.eq('id', wsId) : q).limit(1);
  if (error || !data?.length) return false;
  const w = data[0];
  const t = Date.now();
  sqlite.runSync(
    `INSERT OR REPLACE INTO workspaces (id,name,template,phone,address,upi_id,holiday_weekdays,holiday_dates,
       gstin,gst_rate,invoice_prefix,payment_terms_days,country,distance_unit,pay_link,lang,reminder_days,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [w.id, w.name, w.template, w.phone, w.address, w.upi_id, w.holiday_weekdays ?? null, w.holiday_dates ?? null,
      w.gstin ?? null, w.gst_rate ?? null, w.invoice_prefix ?? null, w.payment_terms_days ?? null,
      w.country ?? null, w.distance_unit ?? null, w.pay_link ?? null, w.lang ?? null, w.reminder_days ?? null, Date.parse(w.created_at) || t, t],
  );
  kvSet('ws-pushed', '');
  bump();
  return true;
}

// ---- push ----
async function push(userId: string) {
  for (;;) {
    const rows = all<OutboxRow>('SELECT * FROM outbox ORDER BY seq LIMIT 100');
    if (!rows.length) return;
    let i = 0;
    while (i < rows.length) {
      const r = rows[i];
      const p = JSON.parse(r.payload);
      const isFull = r.op === 'upsert' && !!p.workspace_id;
      if (isFull) {
        const group = [r];
        let j = i + 1;
        while (j < rows.length && rows[j].tableName === r.tableName && rows[j].op === 'upsert' && JSON.parse(rows[j].payload).workspace_id) {
          group.push(rows[j]);
          j++;
        }
        const byId = new Map<string, Row>(); // duplicates in one upsert statement are an error: keep the latest
        for (const g of group) byId.set(g.rowId, toRemote(JSON.parse(g.payload), userId));
        const { error } = await supabase.from(r.tableName).upsert([...byId.values()], { onConflict: 'id' });
        if (error) throw error;
        sqlite.runSync(`DELETE FROM outbox WHERE seq IN (${group.map(() => '?').join(',')})`, group.map((g) => g.seq));
        i = j;
      } else {
        const patch = toRemote(p);
        delete patch.id;
        const { error } = await supabase.from(r.tableName).update(patch).eq('id', r.rowId);
        if (error) throw error;
        sqlite.runSync('DELETE FROM outbox WHERE seq=?', [r.seq]);
        i++;
      }
    }
  }
}

// ---- pull ----
async function pull(wsId: string) {
  for (const table of TABLES) {
    const key = `pulled-${table}`;
    let since = kvGet(key) ?? '1970-01-01T00:00:00Z';
    const cols = localCols(table);
    for (;;) {
      const { data, error } = await supabase.from(table).select('*').eq('workspace_id', wsId)
        .gt('updated_at', since).order('updated_at', { ascending: true }).limit(1000);
      if (error) throw error;
      if (!data?.length) break;
      sqlite.withTransactionSync(() => {
        for (const r of data) {
          if (one('SELECT 1 AS x FROM outbox WHERE table_name=? AND row_id=?', [table, r.id])) continue; // local change pending: it wins
          const o = toLocal(r, cols);
          const keys = Object.keys(o);
          const set = keys.filter((k) => k !== 'id').map((k) => `${k}=excluded.${k}`).join(',');
          sqlite.runSync(
            `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${set}`,
            keys.map((k) => o[k]),
          );
        }
      });
      since = data[data.length - 1].updated_at;
      kvSet(key, since);
      if (data.length < 1000) break;
    }
  }
}

async function refreshPlan(wsId: string) {
  const { data, error } = await supabase.rpc('get_entitlements', { ws: wsId });
  if (error || !data) return;
  setPlan({ plan: data.plan, source: data.source ?? null, expiresAt: data.expires_at ? Date.parse(data.expires_at) : null });
}

let running = false;
let quiet = false;

export async function syncNow() {
  if (running) return;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return setStatus('signedout');
  running = true;
  setStatus('syncing');
  try {
    await ensureCloudWorkspace(user.id);
    const ws = getWorkspace();
    if (ws) {
      await push(user.id);
      await pull(ws.id);
      await refreshPlan(ws.id);
      await refreshMembership(ws.id).catch(() => {});
    }
    quiet = true;
    bump();
    quiet = false;
    setStatus('synced');
  } catch (e: any) {
    const msg = [e?.message ?? String(e), e?.details, e?.hint, e?.code].filter(Boolean).join(' | ');
    console.warn('[sync] failed:', msg);
    if (isDeadSession(e)) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      setStatus('signedout', 'Your session ended. Please sign in again.');
      return;
    }
    if (msg.includes('PLAN_LIMIT')) setStatus('blocked', msg);
    else if (/network|fetch|timeout|failed to/i.test(msg)) setStatus('offline', msg);
    else setStatus('error', msg);
  } finally {
    running = false;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/** Call once at app start: syncs on sign-in, on foreground, and a few seconds after local writes. */
export function startSync() {
  if (started) return;
  started = true;
  subscribe(() => {
    if (quiet || running) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { if (pendingCount() > 0) void syncNow(); }, 3000);
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') { supabase.auth.startAutoRefresh(); void syncNow(); } else supabase.auth.stopAutoRefresh();
  });
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') void syncNow();
    if (event === 'SIGNED_OUT') setStatus('signedout');
  });
  void syncNow();
}
