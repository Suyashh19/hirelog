import { all, one, save, softDelete, uuid, now, getWorkspace, getCustomer, listResources, addItem } from '../db/repo';
import { formatMoney } from '../core/money';
import { region } from '../core/region';
import type { ItemInput } from '../db/repo';

/**
 * Quotes / estimates: lines of description × quantity × price, sent to a customer, accepted or declined,
 * and turned into a job (an entry with those lines) when the customer agrees.
 */
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'converted';
export interface Quote {
  id: string; workspaceId: string; customerId: string | null; number: number; status: QuoteStatus;
  validUntil: number | null; note: string | null; lines: string; totalPaise: number; updatedAt: number;
}
export interface QuoteRow extends Quote { customerName: string | null }

export const quoteLines = (q: Pick<Quote, 'lines'>): ItemInput[] => {
  try { return JSON.parse(q.lines) as ItemInput[]; } catch { return []; }
};
export const linesTotal = (lines: ItemInput[]) => lines.reduce((s, l) => s + Math.round(l.amountPaise * l.quantity), 0);

export const listQuotes = () =>
  all<QuoteRow>(`SELECT q.*, c.name AS customer_name FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id
                 WHERE q.deleted_at IS NULL ORDER BY q.number DESC`);
export const getQuote = (id: string) =>
  one<QuoteRow>(`SELECT q.*, c.name AS customer_name FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.id=?`, [id]);

export function saveQuote(q: { id?: string; customerId: string | null; lines: ItemInput[]; note?: string | null; validDays?: number | null; status?: QuoteStatus }) {
  const ws = getWorkspace();
  if (!ws) return null;
  const existing = q.id ? getQuote(q.id) : null;
  const id = existing?.id ?? uuid();
  const number = existing?.number ?? ((one<{ n: number }>('SELECT COALESCE(MAX(number),0)+1 AS n FROM quotes')?.n) ?? 1);
  save('quotes', {
    id, workspaceId: ws.id, customerId: q.customerId, number, status: q.status ?? existing?.status ?? 'draft',
    validUntil: q.validDays ? now() + q.validDays * 86400000 : existing?.validUntil ?? null,
    note: q.note ?? null, lines: JSON.stringify(q.lines), totalPaise: linesTotal(q.lines), deletedAt: null,
  });
  return id;
}

export function setQuoteStatus(id: string, status: QuoteStatus) {
  const q = getQuote(id);
  if (!q) return;
  const { customerName, ...row } = q;
  save('quotes', { ...row, status, deletedAt: null });
}
export const deleteQuote = (id: string) => softDelete('quotes', id);

/** Accepted quote -> a finished job with the quote's lines, ready to bill. Returns the entry id. */
export function convertQuote(id: string): string | null {
  const q = getQuote(id);
  const ws = getWorkspace();
  const res = listResources()[0];
  if (!q || !ws || !res) return null;
  const entryId = uuid();
  const t = now();
  save('time_entries', {
    id: entryId, workspaceId: ws.id, resourceId: res.id, customerId: q.customerId, siteId: null, rateId: null, variantName: null,
    startedAt: t, endedAt: t, breakSeconds: 0, pauseStartedAt: null, billableSeconds: 0, quantity: 1, unit: 'job',
    rateSnapshot: null, amountPaise: 0, status: 'done', source: 'manual', deviceUptimeStart: null, deviceUptimeEnd: null,
    tamperFlag: 0, billId: null, note: `From quote Q-${q.number}${q.note ? ' · ' + q.note : ''}`, deletedAt: null,
  });
  for (const l of quoteLines(q)) addItem(ws.id, entryId, l.description, l.amountPaise, l.quantity);
  setQuoteStatus(id, 'converted');
  return entryId;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const d = (ms: number) => new Date(ms).toLocaleDateString(region().locale, { day: '2-digit', month: 'short', year: 'numeric' });

export function quoteHtml(q: QuoteRow): string {
  const ws = getWorkspace()!;
  const cust = q.customerId ? getCustomer(q.customerId) : null;
  const lines = quoteLines(q);
  const rows = lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.quantity}</td><td class="r">${formatMoney(l.amountPaise)}</td><td class="r">${formatMoney(Math.round(l.amountPaise * l.quantity))}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<style>body{font-family:Helvetica,Arial,sans-serif;color:#14211D;margin:32px;font-size:13px} h1{margin:0;font-size:22px}
.muted{color:#68756F} .head{display:flex;justify-content:space-between;border-bottom:3px solid #0F5C4D;padding-bottom:14px;margin-bottom:16px}
.doc{color:#0F5C4D;font-weight:bold;letter-spacing:1px} table{width:100%;border-collapse:collapse;margin-top:12px}
th{text-align:left;background:#F4F2EC;padding:8px 6px;font-size:12px} td{padding:7px 6px;border-bottom:1px solid #E6E1D6} .r{text-align:right}
.tot{margin-top:12px;text-align:right;font-size:18px;font-weight:bold}</style></head><body>
<div class="head"><div><h1>${esc(ws.name)}</h1><div class="muted">${[ws.phone, ws.address].filter(Boolean).map((x) => esc(x!)).join('<br/>')}</div></div>
<div style="text-align:right"><div class="doc">QUOTE</div><h1>Q-${q.number}</h1><div class="muted">Date: ${d(q.updatedAt)}${q.validUntil ? `<br/>Valid until ${d(q.validUntil)}` : ''}</div></div></div>
${cust ? `<div><span class="muted">For</span> <b>${esc(cust.name)}</b></div>` : ''}
<table><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>${rows}</table>
<div class="tot">Total ${formatMoney(q.totalPaise)}</div>
${q.note ? `<p class="muted">${esc(q.note)}</p>` : ''}
<p class="muted" style="margin-top:24px">${region().code === 'IN' ? 'Prices do not include GST unless stated.' : 'Prices exclude tax unless stated.'}</p>
</body></html>`;
}

export function quoteText(q: QuoteRow): string {
  const ws = getWorkspace()!;
  const lines = quoteLines(q).map((l) => `• ${l.description}${l.quantity !== 1 ? ` ${l.quantity} × ${formatMoney(l.amountPaise)}` : ''} – ${formatMoney(Math.round(l.amountPaise * l.quantity))}`);
  return [
    `Hello${q.customerName ? ' ' + q.customerName : ''},`,
    `Quote Q-${q.number} from ${ws.name}:`,
    lines.join('\n'),
    `*Total: ${formatMoney(q.totalPaise)}*${q.validUntil ? ` (valid until ${d(q.validUntil)})` : ''}`,
    q.note ?? '',
    'Reply YES to go ahead. Thank you!',
  ].filter(Boolean).join('\n');
}
