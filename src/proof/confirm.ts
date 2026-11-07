import * as Crypto from 'expo-crypto';
import { CONFIRM_PAGE_URL } from '../config';
import { getEntry, getWorkspace, save } from '../db/repo';
import { supabase } from '../cloud';
import { syncNow, pendingCount } from '../sync/sync';
import { formatMoney } from '../core/money';
import { formatDuration } from '../core/time';
import { meterHours } from '../core/gst';
import { UNIT_LABEL } from '../core/rate';
import { openWhatsApp } from '../bills/share';
import { getCustomer } from '../db/repo';

/**
 * Customer confirmation: a secret link to a small public page where the customer taps Confirm or Dispute.
 * The answer is written on the server (respond_confirmation) and comes back to the phone with the next sync.
 */
export const confirmAvailable = () => !!CONFIRM_PAGE_URL;

const linkFor = (token: string) => `${CONFIRM_PAGE_URL}${CONFIRM_PAGE_URL.includes('?') ? '&' : '?'}t=${token}`;

export function workSummary(e: ReturnType<typeof getEntry> & {}) {
  const mh = meterHours(e.meterStart, e.meterEnd);
  if (e.unit === 'km') return `${e.quantity ?? mh ?? 0} ${UNIT_LABEL.km.many}${mh !== null ? ` (dashboard ${e.meterStart} → ${e.meterEnd})` : e.gpsKm != null ? ' (GPS)' : ''}`;
  if (e.unit === 'hour') return `${formatDuration(e.billableSeconds)}${mh !== null ? ` (hours counter ${e.meterStart} → ${e.meterEnd})` : ''}`;
  const q = e.quantity ?? 1;
  return `${q} ${UNIT_LABEL[e.unit][q === 1 ? 'one' : 'many']}`;
}

export type ConfirmResult = { ok: true } | { ok: false; message: string };

/** Makes (or reuses) the entry's link, makes sure the server has it, and opens WhatsApp to the customer. */
export async function askToConfirm(entryId: string): Promise<ConfirmResult> {
  if (!CONFIRM_PAGE_URL) return { ok: false, message: 'Customer confirmation is not set up yet (the confirmation web page is not published).' };
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, message: 'Sign in first (More → Sign in to back up). The customer\'s answer is stored online.' };
  const e = getEntry(entryId);
  if (!e || e.status === 'running') return { ok: false, message: 'Stop the work first, then ask for confirmation.' };
  let token = e.confirmToken;
  if (!token) {
    const bytes = Crypto.getRandomBytes(18);
    token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const { resourceName, customerName, siteName, itemsPaise, ...row } = e as any;
    save('time_entries', { ...row, confirmToken: token });
  }
  await syncNow();
  if (pendingCount() > 0) return { ok: false, message: 'No internet right now. Connect and try again, so the link works for the customer.' };
  const ws = getWorkspace();
  const cust = e.customerId ? getCustomer(e.customerId) : null;
  const when = new Date(e.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const text = [
    `Hello${cust ? ' ' + cust.name : ''},`,
    `${ws?.name ?? 'We'} recorded: ${e.resourceName} on ${when} — ${workSummary(e)}${e.amountPaise ? `, ${formatMoney(e.amountPaise + e.itemsPaise)}` : ''}.`,
    `Please tap to confirm (or tell us if something is wrong):`,
    linkFor(token),
  ].join('\n');
  await openWhatsApp(cust?.phone ?? null, text);
  return { ok: true };
}

export const confirmBadge = (status: string | null | undefined) =>
  status === 'confirmed' ? { icon: 'check-decagram', text: 'Confirmed by customer', tone: 'money' as const }
    : status === 'disputed' ? { icon: 'alert-decagram', text: 'Disputed by customer', tone: 'danger' as const }
      : null;
