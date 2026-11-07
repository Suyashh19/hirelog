import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Alert, Linking, Share } from 'react-native';
import { router } from 'expo-router';
import { bumpPdfCount, hasFeature, pdfBlocked } from '../billing/plan';
import { getLogo } from './logo';
import { billHtml, billWhatsAppText } from './html';
import { billEntries, billItems, getBill, getWorkspace, markBillSent } from '../db/repo';
import { photosForBill } from '../proof/photos';

function waNumber(phone: string | null) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
}

const fail = (title: string, e: unknown) =>
  Alert.alert(title, String((e as any)?.message ?? e).replace(/\s+/g, ' ').slice(0, 220));

/** Opens WhatsApp with the message ready; falls back to the system share sheet if WhatsApp is not installed. */
export async function openWhatsApp(phone: string | null, text: string) {
  try {
    await Linking.openURL(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`);
  } catch {
    try {
      await Share.share({ message: text });
    } catch (e) {
      fail('Could not open WhatsApp', e);
    }
  }
}

export async function shareBillOnWhatsApp(billId: string) {
  try {
    const bill = getBill(billId);
    const ws = getWorkspace();
    if (!bill || !ws) return;
    await openWhatsApp(bill.customerPhone, billWhatsAppText(ws, bill, billEntries(billId), billItems(billId)));
    markBillSent(billId);
  } catch (e) {
    fail('Could not share the bill', e);
  }
}

/** The bill as HTML, exactly as it goes into the PDF (used by the in-app preview). */
export const billPreviewHtml = async (billId: string) => (await htmlFor(billId))?.html ?? null;

async function htmlFor(billId: string) {
  const bill = getBill(billId);
  const ws = getWorkspace();
  if (!bill || !ws) return null;
  const entries = billEntries(billId);
  // photo proof (Business): a page of small photos at the end of the bill
  const photos = hasFeature('photo-proof') ? await photosForBill(entries.map((e) => e.id)) : [];
  return {
    bill, ws,
    html: billHtml({ ws, bill, entries, items: billItems(billId), footer: !hasFeature('remove-footer'), logo: hasFeature('remove-footer') ? getLogo() : null, photos }),
  };
}

/**
 * Generates the PDF on the phone (works offline) and opens the share sheet.
 * Android only lets the share sheet read files inside this app's own folders, and expo-print writes elsewhere
 * ("Not allowed to read file under given URL"), so we try several safe locations in turn and report which step failed.
 */
const b64ToBytes = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export async function shareBillPdf(billId: string) {
  const blocked = pdfBlocked();
  if (blocked) { router.push({ pathname: '/paywall', params: { trigger: blocked.trigger } }); return; }
  const made = await htmlFor(billId);
  if (!made) return;
  const name = `${made.bill.taxPaise ? 'Invoice' : 'Bill'}-${(made.ws.invoicePrefix ?? '').replace(/[^A-Za-z0-9-]/g, '')}${made.bill.number}.pdf`;
  await sharePdf(made.html, name, `Bill #${made.bill.number}`, () => { bumpPdfCount(); markBillSent(billId); });
}

/** Makes a PDF from HTML on the phone and opens the share sheet; used for bills and quotes. */
export async function sharePdf(html: string, name: string, title: string, onShared?: () => void) {
  const errors: string[] = [];
  try {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Sharing is not available on this phone');
      return;
    }
    const share = (uri: string) => Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
    const done = () => { onShared?.(); };
    const made = { html };

    const printed = await Print.printToFileAsync({ html: made.html, base64: true });

    // 1) copy into the app cache
    try {
      const dest = new File(Paths.cache, name);
      new File(printed.uri).copySync(dest, { overwrite: true });
      await share(dest.uri);
      return done();
    } catch (e: any) { errors.push('cache: ' + (e?.message ?? e)); }

    // 2) write the bytes into the app documents folder
    try {
      if (!printed.base64) throw new Error('no data');
      const dest = new File(Paths.document, name);
      if (dest.exists) dest.delete();
      dest.create();
      await dest.write(b64ToBytes(printed.base64));
      await share(dest.uri);
      return done();
    } catch (e: any) { errors.push('documents: ' + (e?.message ?? e)); }

    // 3) the file exactly as printed
    try {
      await share(printed.uri);
      return done();
    } catch (e: any) { errors.push('direct: ' + (e?.message ?? e)); }

    // 4) last resort: the print dialog can save or share a PDF itself
    Alert.alert('Opening the print screen instead', 'Choose "Save as PDF" there.\n\n' + errors.join('\n').replace(/\s+/g, ' ').slice(0, 300));
    await Print.printAsync({ html: made.html });
  } catch (e) {
    fail('Could not share the PDF', [...errors, String((e as any)?.message ?? e)].join(' | '));
  }
}

export async function previewBillPdf(billId: string) {
  try {
    const made = await htmlFor(billId);
    if (made) await Print.printAsync({ html: made.html });
  } catch (e) {
    fail('Could not preview the PDF', e);
  }
}
