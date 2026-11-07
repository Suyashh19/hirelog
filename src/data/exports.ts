import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { all, billLabel, getWorkspace } from '../db/repo';
import { region } from '../core/region';

/**
 * ST-1: export ALL data as JSON (free on every plan), and invoices as CSV in the layouts accountants import:
 * Xero, QuickBooks Online, and a plain sales register for Tally or any accountant (Business).
 */
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
const money = (minor: number) => (minor / 100).toFixed(2);
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ukDate = (ms: number) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

async function shareFile(name: string, text: string, mime: string) {
  try {
    const f = new File(Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    await f.write(text);
    if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing is not available on this phone'); return; }
    await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: name });
  } catch (e: any) {
    Alert.alert('Could not export', String(e?.message ?? e).slice(0, 200));
  }
}

const TABLES = ['workspaces', 'resources', 'rates', 'customers', 'sites', 'time_entries', 'entry_items', 'bills', 'payments', 'quotes', 'expenses'];

/** Everything on this phone in one JSON file (your own backup or to move elsewhere). */
export async function exportAllJson() {
  const out: Record<string, unknown> = { app: 'HireLog', exportedAt: new Date().toISOString(), version: 1 };
  for (const t of TABLES) out[t] = all<Record<string, unknown>>(`SELECT * FROM ${t}`);
  await shareFile(`HireLog-backup-${isoDate(Date.now())}.json`, JSON.stringify(out, null, 1), 'application/json');
}

interface Line { billId: string; number: number; date: number; due: number | null; customer: string; description: string; qty: number; unitMinor: number; amountMinor: number; taxRate: number | null }

/** One line per piece of work or material on every sent/paid bill in the period. */
function invoiceLines(from: number, to: number): Line[] {
  const bills = all<{ id: string; number: number; updatedAt: number; dueAt: number | null; customerName: string; gstRate: number | null; taxPaise: number }>(
    `SELECT b.id, b.number, b.updated_at, b.due_at, b.gst_rate, b.tax_paise, c.name AS customer_name FROM bills b JOIN customers c ON c.id=b.customer_id
     WHERE b.deleted_at IS NULL AND b.status<>'draft' AND b.updated_at>=? AND b.updated_at<? ORDER BY b.number`, [from, to]);
  const lines: Line[] = [];
  for (const b of bills) {
    const work = all<{ id: string; resourceName: string; unit: string; quantity: number | null; billableSeconds: number; amountPaise: number; startedAt: number; note: string | null }>(
      `SELECT t.id, r.name AS resource_name, t.unit, t.quantity, t.billable_seconds, t.amount_paise, t.started_at, t.note
       FROM time_entries t LEFT JOIN resources r ON r.id=t.resource_id WHERE t.bill_id=? AND t.deleted_at IS NULL ORDER BY t.started_at`, [b.id]);
    for (const w of work) {
      if (w.amountPaise) {
        const qty = w.unit === 'hour' ? Math.round((w.billableSeconds / 3600) * 100) / 100 : w.quantity ?? 1;
        lines.push({ billId: b.id, number: b.number, date: b.updatedAt, due: b.dueAt, customer: b.customerName,
          description: `${w.resourceName ?? 'Work'} ${isoDate(w.startedAt)}${w.note ? ' – ' + w.note : ''}`.slice(0, 200),
          qty, unitMinor: qty ? Math.round(w.amountPaise / qty) : w.amountPaise, amountMinor: w.amountPaise, taxRate: b.taxPaise ? b.gstRate : null });
      }
      const items = all<{ description: string; quantity: number; amountPaise: number }>('SELECT * FROM entry_items WHERE entry_id=? AND deleted_at IS NULL', [w.id]);
      for (const i of items) lines.push({ billId: b.id, number: b.number, date: b.updatedAt, due: b.dueAt, customer: b.customerName,
        description: i.description, qty: i.quantity, unitMinor: i.amountPaise, amountMinor: Math.round(i.amountPaise * i.quantity), taxRate: b.taxPaise ? b.gstRate : null });
    }
  }
  return lines;
}

export type AccountingFormat = 'xero' | 'quickbooks' | 'register';

export async function exportInvoices(format: AccountingFormat, from: number, to: number) {
  const ws = getWorkspace();
  const lines = invoiceLines(from, to);
  if (!lines.length) { Alert.alert('Nothing to export', 'There are no sent or paid bills in this period.'); return; }
  const label = (n: number) => billLabel(ws, n);
  let rows: unknown[][];
  if (format === 'xero') {
    // Xero "Import sales invoices" template (required columns marked * in Xero). Account 200 = Sales; set the tax type in Xero if needed.
    rows = [['*ContactName', '*InvoiceNumber', '*InvoiceDate', '*DueDate', '*Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'Currency'],
      ...lines.map((l) => [l.customer, label(l.number), ukDate(l.date), ukDate(l.due ?? l.date), l.description, l.qty, money(l.unitMinor), '200',
        l.taxRate ? `${region().taxName} on Income` : 'No VAT', region().currency])];
  } else if (format === 'quickbooks') {
    // QuickBooks Online "Import invoices" columns
    rows = [['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', 'ItemAmount', 'Currency'],
      ...lines.map((l) => [label(l.number), l.customer, isoDate(l.date), isoDate(l.due ?? l.date), 'Services', l.description, l.qty, money(l.unitMinor), money(l.amountMinor), region().currency])];
  } else {
    // One row per bill: for Tally (Sales voucher entry) or any accountant
    const bills = all<{ number: number; updatedAt: number; customerName: string; customerGstin: string | null; subtotalPaise: number; taxPaise: number; tdsPaise: number; totalPaise: number; previousBalancePaise: number; status: string }>(
      `SELECT b.number, b.updated_at, b.subtotal_paise, b.tax_paise, b.tds_paise, b.total_paise, b.previous_balance_paise, b.status,
              c.name AS customer_name, c.gstin AS customer_gstin
       FROM bills b JOIN customers c ON c.id=b.customer_id WHERE b.deleted_at IS NULL AND b.status<>'draft' AND b.updated_at>=? AND b.updated_at<? ORDER BY b.number`, [from, to]);
    rows = [['Date', 'Voucher No', 'Party', `Party ${region().taxIdLabel}`, 'Taxable value', region().taxName, 'TDS', 'Invoice value', 'Status'],
      ...bills.map((b) => [isoDate(b.updatedAt), label(b.number), b.customerName, b.customerGstin ?? '', money(b.subtotalPaise), money(b.taxPaise),
        money(b.tdsPaise), money(b.subtotalPaise + b.taxPaise - b.tdsPaise), b.status])];
  }
  const name = `HireLog-${format === 'register' ? 'sales-register' : format}-${isoDate(from)}-to-${isoDate(to - 1)}.csv`;
  await shareFile(name, csv(rows), 'text/csv');
}
