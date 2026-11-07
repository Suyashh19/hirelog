import * as Notifications from 'expo-notifications';
import { all, getWorkspace, kvGet, kvSet } from '../db/repo';
import { formatMoney } from '../core/money';

/**
 * Automatic payment reminders (Pro). WhatsApp cannot be sent without the user pressing Send, so the phone
 * reminds the OWNER on day 3 / 7 / 15 after a bill was sent (and still unpaid); tapping opens "To collect"
 * with a ready reminder message. Re-planned whenever the app opens or bills change.
 */
const PREFIX = 'pay-reminder-';
export const DEFAULT_REMINDER_DAYS = [3, 7, 15];

export function reminderDays(): number[] {
  const raw = getWorkspace()?.reminderDays;
  if (raw === 'off') return [];
  const days = (raw ?? '').split(',').map((x) => parseInt(x, 10)).filter((n) => n > 0 && n < 120);
  return days.length ? days : DEFAULT_REMINDER_DAYS;
}

interface OpenBill { id: string; number: number; sentAt: number | null; totalPaise: number; customerName: string; status: string }

/** Cancels the old plan and schedules the next reminders (at 10:00 local time). Safe to call often. */
export async function planReminders(enabled: boolean) {
  try {
    const sig = kvGet('reminder-ids');
    for (const id of sig ? sig.split(',') : []) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    if (!enabled) { kvSet('reminder-ids', ''); return; }
    const days = reminderDays();
    const bills = all<OpenBill>(
      `SELECT b.id, b.number, b.sent_at, b.total_paise, b.status, c.name AS customer_name FROM bills b JOIN customers c ON c.id=b.customer_id
       WHERE b.deleted_at IS NULL AND b.status IN ('sent','partly_paid') AND b.sent_at IS NOT NULL`);
    const ids: string[] = [];
    const now = Date.now();
    for (const b of bills) {
      for (const d of days) {
        const at = new Date(b.sentAt!);
        at.setDate(at.getDate() + d);
        at.setHours(10, 0, 0, 0);
        if (at.getTime() <= now) continue;
        const id = `${PREFIX}${b.id}-${d}`;
        await Notifications.scheduleNotificationAsync({
          identifier: id,
          content: {
            title: `${b.customerName} has not paid yet`,
            body: `${formatMoney(b.totalPaise)} · bill sent ${d} days ago. Tap to send a polite reminder.`,
            data: { type: 'reminder', billId: b.id },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at } as any,
        });
        ids.push(id);
        if (ids.length >= 40) break; // keep well under the phone's limit on scheduled alerts
      }
      if (ids.length >= 40) break;
    }
    kvSet('reminder-ids', ids.join(','));
  } catch {
    // reminders are a helper; never break the app
  }
}
