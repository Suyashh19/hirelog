import qrcode from 'qrcode-generator';
import { formatINR } from '../core/money';
import { formatDuration } from '../core/time';
import { meterHours } from '../core/gst';
import { UNIT_LABEL } from '../core/rate';
import { region } from '../core/region';
import type { Bill, EntryRow, Workspace } from '../db/repo';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const dateStr = (ms: number) => new Date(ms).toLocaleDateString(region().locale, { day: '2-digit', month: 'short', year: 'numeric' });

export function upiUri(ws: Pick<Workspace, 'upiId' | 'name'>, amountPaise: number, billNo: number | string) {
  if (!ws.upiId) return null;
  const p = new URLSearchParams({ pa: ws.upiId, pn: ws.name, am: (amountPaise / 100).toFixed(2), cu: 'INR', tn: `Bill ${billNo}` });
  return `upi://pay?${p.toString()}`;
}

/** A broken QR must never stop the bill from being made, so failures simply omit the QR. */
function qrSvg(text: string): string | null {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
  } catch {
    return null;
  }
}

type BillFull = Bill & { customerName: string; customerGstin?: string | null; customerArea?: string | null };
const label = (ws: Workspace, n: number) => `${ws.invoicePrefix ?? ''}${n}`;
const workText = (e: EntryRow) => {
  const mh = meterHours(e.meterStart, e.meterEnd);
  if (mh !== null && e.unit === 'km') return `${e.quantity ?? mh} km (dashboard ${e.meterStart} → ${e.meterEnd})`;
  if (e.unit === 'km' && e.gpsKm != null) return `${e.quantity ?? e.gpsKm} km (GPS counted ${e.gpsKm} km)`;
  if (mh !== null) return `${formatDuration(e.billableSeconds)} (meter ${e.meterStart} → ${e.meterEnd})`;
  return e.unit === 'hour' ? formatDuration(e.billableSeconds) : `${e.quantity ?? 1} ${UNIT_LABEL[e.unit]?.[(e.quantity ?? 1) === 1 ? 'one' : 'many'] ?? e.unit}`;
};
/** CGST/SGST halves or IGST, from what the bill stored when it was made. */
export function taxLines(bill: Pick<Bill, 'taxPaise' | 'gstRate' | 'igst' | 'tdsPaise' | 'tdsRate'>): { label: string; paise: number }[] {
  const out: { label: string; paise: number }[] = [];
  const tax = bill.taxPaise ?? 0;
  const r = bill.gstRate ?? 0;
  if (tax) {
    if (bill.igst === 2) out.push({ label: `${region().taxName} ${r}%`, paise: tax });
    else if (bill.igst === 1) out.push({ label: `IGST ${r}%`, paise: tax });
    else {
      const half = Math.round(tax / 2);
      out.push({ label: `CGST ${r / 2}%`, paise: half }, { label: `SGST ${r / 2}%`, paise: tax - half });
    }
  }
  if (bill.tdsPaise) out.push({ label: `Less TDS ${bill.tdsRate ?? ''}% (deducted by you)`, paise: -bill.tdsPaise });
  return out;
}

/** Where the customer pays: UPI in India, the business's own pay link (Stripe, PayPal…) elsewhere. */
export function payTarget(ws: Workspace, amountPaise: number, ref: string): { uri: string; label: string } | null {
  if (region().upi && ws.upiId) {
    const uri = upiUri(ws, amountPaise, ref);
    return uri ? { uri, label: ws.upiId } : null;
  }
  if (ws.payLink && /^https?:\/\//i.test(ws.payLink.trim())) return { uri: ws.payLink.trim(), label: 'Pay online' };
  return null;
}

/** BL-3 / BL-7: PDF bill made on the phone. A GST bill prints as a tax invoice. Free plan gets a footer. */
export function billHtml(o: {
  ws: Workspace; bill: BillFull; entries: EntryRow[];
  items: { description: string; amountPaise: number; quantity: number }[]; footer: boolean; logo?: string | null;
  photos?: { src: string; caption: string }[];
}) {
  const { ws, bill, entries, items } = o;
  const isTax = (bill.taxPaise ?? 0) > 0;
  const proof = (e: EntryRow) => [
    e.confirmationStatus === 'confirmed' ? `<span class="ok">✓ Confirmed by customer${e.confirmedAt ? ' ' + dateStr(e.confirmedAt) : ''}</span>` : '',
    e.confirmationStatus === 'disputed' ? `<span class="bad">Disputed by customer</span>` : '',
    e.gpsFrom || e.gpsTo ? `${esc(e.gpsFrom ?? '?')} → ${esc(e.gpsTo ?? '?')}` : '',
  ].filter(Boolean).join(' · ');
  const rows = entries.map((e) => `
    <tr>
      <td>${dateStr(e.startedAt)}</td>
      <td>${esc([e.resourceName, e.siteName, e.variantName].filter(Boolean).join(' · '))}${e.note ? `<div class="n">${esc(e.note)}</div>` : ''}${proof(e) ? `<div class="n">${proof(e)}</div>` : ''}</td>
      <td class="r">${esc(workText(e))}</td>
      <td class="r">${formatINR(e.amountPaise)}</td>
    </tr>`).join('');
  const itemRows = items.length ? `<tr class="sub"><td colspan="4">Materials and charges</td></tr>` + items.map((i) => `
    <tr><td></td><td>${esc(i.description)}</td><td class="r">${i.quantity} × ${formatINR(i.amountPaise)}</td><td class="r">${formatINR(Math.round(i.amountPaise * i.quantity))}</td></tr>`).join('') : '';
  const pay = payTarget(ws, bill.totalPaise, label(ws, bill.number));
  const svg = pay && bill.totalPaise > 0 ? qrSvg(pay.uri) : null;
  const qr = svg ? `<div class="qr">${svg}<div><b>Scan to pay ${formatINR(bill.totalPaise)}</b><br/>${esc(pay!.label)}</div></div>` : '';
  const tl = taxLines(bill).map((t) => `<tr><td>${t.label}</td><td class="r">${formatINR(t.paise)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<style>
body{font-family:Helvetica,Arial,sans-serif;color:#14211D;margin:32px;font-size:13px}
h1{margin:0;font-size:22px} .muted{color:#68756F} .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0F5C4D;padding-bottom:14px;margin-bottom:16px}
.doc{color:#0F5C4D;font-size:13px;font-weight:bold;letter-spacing:1px}
.parties{display:flex;justify-content:space-between;gap:20px;margin-bottom:6px} .box{flex:1}
table{width:100%;border-collapse:collapse;margin-top:12px} th{text-align:left;background:#F4F2EC;padding:8px 6px;font-size:12px}
td{padding:7px 6px;border-bottom:1px solid #E6E1D6;vertical-align:top} .r{text-align:right} .n{color:#68756F;font-size:11px}
.sub td{font-weight:bold;color:#68756F;font-size:11px;text-transform:uppercase;border-bottom:none;padding-top:12px}
.bottom{display:flex;justify-content:space-between;align-items:flex-start;margin-top:16px}
.tot{width:55%} .tot td{border:none;padding:4px 6px} .grand td{font-weight:bold;font-size:16px;border-top:2px solid #14211D;padding-top:8px}
.qr{width:130px;font-size:11px;text-align:center} .foot{margin-top:30px;color:#999;font-size:11px;text-align:center}
.ok{color:#14935F;font-weight:bold} .bad{color:#C0392B;font-weight:bold}
.photos{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px;page-break-inside:avoid} .photos figure{margin:0;width:31%}
.photos img{width:100%;border-radius:6px} .photos figcaption{font-size:10px;color:#68756F}
</style></head><body>
<div class="head">
  <div>${o.logo ? `<img src="${o.logo}" style="height:54px;margin-bottom:6px"/>` : ''}<h1>${esc(ws.name)}</h1>
    <div class="muted">${[ws.phone, ws.address].filter(Boolean).map((x) => esc(x!)).join('<br/>')}${ws.gstin ? `<br/>${esc(region().taxIdLabel)}: ${esc(ws.gstin)}` : ''}</div></div>
  <div style="text-align:right"><div class="doc">${isTax ? 'TAX INVOICE' : region().code === 'IN' ? 'BILL' : 'INVOICE'}</div><h1>${esc(label(ws, bill.number))}</h1>
    <div class="muted">Date: ${dateStr(bill.updatedAt)}${bill.dueAt ? `<br/><b>Due: ${dateStr(bill.dueAt)}</b>` : ''}</div></div>
</div>
<div class="parties">
  <div class="box"><div class="muted">Bill to</div><b>${esc(bill.customerName)}</b>${bill.customerArea ? `<br/>${esc(bill.customerArea)}` : ''}${bill.customerGstin ? `<br/>${esc(region().taxIdLabel)}: ${esc(bill.customerGstin)}` : ''}</div>
  <div class="box" style="text-align:right"><div class="muted">Work period</div>${dateStr(bill.periodFrom)} – ${dateStr(bill.periodTo)}</div>
</div>
<table><tr><th>Date</th><th>Work</th><th class="r">Time / Qty</th><th class="r">Amount</th></tr>${rows}${itemRows}</table>
<div class="bottom">
  ${qr || '<div></div>'}
  <table class="tot">
    <tr><td>${isTax ? 'Taxable value' : 'This bill'}</td><td class="r">${formatINR(bill.subtotalPaise)}</td></tr>
    ${tl}
    ${bill.previousBalancePaise ? `<tr><td>Previous balance</td><td class="r">${formatINR(bill.previousBalancePaise)}</td></tr>` : ''}
    <tr class="grand"><td>Total due</td><td class="r">${formatINR(bill.totalPaise)}</td></tr>
  </table>
</div>
${o.photos?.length ? `<h3 style="margin-top:24px">Photos</h3><div class="photos">${o.photos.map((p) => `<figure><img src="${p.src}"/><figcaption>${esc(p.caption)}</figcaption></figure>`).join('')}</div>` : ''}
${o.footer ? '<div class="foot">Made with HireLog</div>' : ''}
</body></html>`;
}

export function billWhatsAppText(ws: Workspace, bill: BillFull, entries: EntryRow[], items: { description: string; amountPaise: number; quantity: number }[] = []) {
  const lines = entries.slice(0, 15).map((e) =>
    `• ${dateStr(e.startedAt)} ${[e.resourceName, e.siteName, e.variantName].filter(Boolean).join(' · ')}: ${workText(e)} – ${formatINR(e.amountPaise)}`);
  const more = entries.length > 15 ? `\n…and ${entries.length - 15} more` : '';
  const mat = items.length ? items.slice(0, 10).map((i) => `• ${i.description}${i.quantity !== 1 ? ` ${i.quantity} × ${formatINR(i.amountPaise)}` : ''} – ${formatINR(Math.round(i.amountPaise * i.quantity))}`).join('\n') : '';
  const pay = payTarget(ws, bill.totalPaise, label(ws, bill.number));
  const isTax = (bill.taxPaise ?? 0) > 0 || (bill.tdsPaise ?? 0) > 0;
  return [
    `Hello ${bill.customerName},`,
    `${isTax ? 'Tax invoice' : 'Bill'} ${label(ws, bill.number)} from ${ws.name} (${dateStr(bill.periodFrom)} – ${dateStr(bill.periodTo)})`,
    lines.join('\n') + more,
    mat ? `Materials and charges:\n${mat}` : '',
    isTax ? `${(bill.taxPaise ?? 0) > 0 ? 'Taxable value' : 'Work'}: ${formatINR(bill.subtotalPaise)}\n${taxLines(bill).map((t) => `${t.label}: ${formatINR(t.paise)}`).join('\n')}` : '',
    bill.previousBalancePaise ? `Previous balance: ${formatINR(bill.previousBalancePaise)}` : '',
    `*Total due: ${formatINR(bill.totalPaise)}*${bill.dueAt ? ` by ${dateStr(bill.dueAt)}` : ''}`,
    region().upi && ws.upiId ? `Pay via UPI: ${ws.upiId}` : '',
    pay ? `Pay link: ${pay.uri}` : '',
    'Thank you!',
  ].filter(Boolean).join('\n');
}
