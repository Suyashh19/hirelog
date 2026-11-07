import { Share } from 'react-native';
import { sqlite } from '../db/client';
import { all, bump } from '../db/repo';
import { supabase } from '../cloud';
import { pendingCount, syncNow } from '../sync/sync';
import { isDeadSession } from './session';

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** ST-1: export entries as CSV text through the share sheet (Excel opens it). */
export async function exportEntriesCsv() {
  const rows = all<any>(
    `SELECT t.started_at, t.ended_at, r.name AS resource, c.name AS customer, t.unit, t.billable_seconds, t.quantity,
            t.amount_paise, t.status, t.source, t.note
     FROM time_entries t LEFT JOIN resources r ON r.id=t.resource_id LEFT JOIN customers c ON c.id=t.customer_id
     WHERE t.deleted_at IS NULL AND t.status<>'running' ORDER BY t.started_at`);
  const head = 'Date,Start,End,Resource,Customer,Unit,Hours,Quantity,Amount (INR),Status,Source,Note';
  const lines = rows.map((r) => [
    new Date(r.startedAt).toISOString().slice(0, 10),
    new Date(r.startedAt).toLocaleTimeString('en-IN'),
    r.endedAt ? new Date(r.endedAt).toLocaleTimeString('en-IN') : '',
    r.resource, r.customer, r.unit, (r.billableSeconds / 3600).toFixed(2), r.quantity ?? '',
    (r.amountPaise / 100).toFixed(2), r.status, r.source, r.note,
  ].map(esc).join(','));
  await Share.share({ title: 'HireLog entries', message: [head, ...lines].join('\n') });
}

/** ST-1: full account deletion. Cloud data first (if signed in), then this phone. */
export async function deleteEverything(): Promise<{ ok: boolean; message?: string }> {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    const { error } = await supabase.rpc('delete_my_account');
    // If the account is already gone (for example deleted in the dashboard) there is nothing to delete in the cloud,
    // so carry on and wipe this phone. Real failures such as no internet still stop here so nothing is half-deleted.
    if (error && !isDeadSession(error)) return { ok: false, message: error.message };
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }
  wipeLocalData();
  return { ok: true };
}

/** Removes everything stored on this phone (the cloud copy, if any, is untouched). */
export function wipeLocalData() {
  sqlite.withTransactionSync(() => {
    for (const t of ['entry_items', 'entry_history', 'time_entries', 'payments', 'bills', 'sites', 'rates', 'customers', 'resources', 'outbox', 'kv', 'workspaces']) {
      sqlite.runSync(`DELETE FROM ${t}`);
    }
  });
  bump();
}

/**
 * Sign out. With wipe=true the data on this phone is removed too, so another person can sign in cleanly;
 * that only happens after everything has been backed up to the cloud.
 */
export async function signOutAccount(wipe: boolean): Promise<{ ok: boolean; message?: string }> {
  if (wipe) {
    await syncNow();
    if (pendingCount() > 0) return { ok: false, message: 'Some work has not been backed up yet. Connect to the internet and try again, or choose "Keep my data".' };
  }
  await supabase.auth.signOut();
  if (wipe) wipeLocalData();
  return { ok: true };
}
