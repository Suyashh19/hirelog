import { region } from './region';

/**
 * Money is an integer number of the smallest unit everywhere (paise, pence, cents); these helpers are the
 * only place we format/parse. The currency comes from the business's country (see region.ts).
 */

export function groupIndian(n: number): string {
  const s = Math.abs(Math.trunc(n)).toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}
export function groupWestern(n: number): string {
  return Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 12345600 -> "₹1,23,456" (India) or "£123,456" (UK); fractions shown only when present. */
export function formatMoney(minor: number): string {
  const r = region();
  const neg = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const major = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = (r.indianGrouping ? groupIndian(major) : groupWestern(major)) + (frac ? `.${frac.toString().padStart(2, '0')}` : '');
  return `${neg ? '-' : ''}${r.symbol}${body}`;
}

/** Kept for the many existing call sites: formats in the business's own currency. */
export const formatINR = formatMoney;

/** "250" / "250.5" / "1,200" / "£12.50" -> smallest units, or null when invalid. */
export function parseMoney(input: string): number | null {
  const t = input.replace(/[^\d.]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(t) || t === '' || t === '.') return null;
  return Math.round(parseFloat(t) * 100);
}
export const parseRupees = parseMoney;
