/**
 * GST for tax invoices (BL-7). Money is integer paise.
 * Same state (or the buyer has no GSTIN, so the place of supply is the seller's state): CGST + SGST, half each.
 * Different states (both GSTINs known and their first two digits differ): IGST.
 */
export const GST_RATES = [0, 5, 12, 18, 28];

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Normalises to upper case without spaces; returns null when it is not a valid GSTIN shape. */
export function cleanGstin(input: string | null | undefined): string | null {
  const g = (input ?? '').replace(/\s+/g, '').toUpperCase();
  return GSTIN_RE.test(g) ? g : null;
}

export const stateCode = (gstin: string) => gstin.slice(0, 2);

export interface GstSplit {
  interState: boolean;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
}

export function gstSplit(taxablePaise: number, ratePercent: number, sellerGstin: string, buyerGstin?: string | null): GstSplit {
  const buyer = cleanGstin(buyerGstin);
  const interState = !!buyer && stateCode(buyer) !== stateCode(sellerGstin);
  const tax = Math.round((taxablePaise * ratePercent) / 100);
  if (interState) return { interState, cgstPaise: 0, sgstPaise: 0, igstPaise: tax, taxPaise: tax };
  const half = Math.round(tax / 2);
  return { interState, cgstPaise: half, sgstPaise: tax - half, igstPaise: 0, taxPaise: tax };
}

/** Hours between two hour-meter readings, or null if they do not make sense. */
export function meterHours(start: number | null | undefined, end: number | null | undefined): number | null {
  if (start == null || end == null || !isFinite(start) || !isFinite(end) || end < start) return null;
  return Math.round((end - start) * 100) / 100;
}
