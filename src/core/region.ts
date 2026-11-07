/**
 * Country settings: currency, number grouping, tax name and ID, distance unit and how customers pay.
 * The active region is set once from the business profile (setRegion) and read by the money helpers.
 */
export type CountryCode = 'IN' | 'GB' | 'US' | 'AU' | 'NZ' | 'CA' | 'IE' | 'AE' | 'ZA' | 'OTHER';

export interface Region {
  code: CountryCode;
  name: string;
  currency: string;          // ISO code
  symbol: string;            // shown before amounts
  indianGrouping: boolean;   // 1,00,000 vs 100,000
  distance: 'km' | 'mi';
  taxName: string;           // "GST", "VAT", "Sales tax"
  taxIdLabel: string;        // "GSTIN", "VAT number", "ABN"
  defaultTaxRate: number;    // percent, a suggestion only
  splitTax: boolean;         // India: CGST + SGST / IGST
  upi: boolean;              // India: UPI QR and link
  priceFactor: number;       // suggested prices in setup: rupees × factor, rounded
  locale: string;
}

export const REGIONS: Record<CountryCode, Region> = {
  IN: { code: 'IN', name: 'India', currency: 'INR', symbol: '₹', indianGrouping: true, distance: 'km', taxName: 'GST', taxIdLabel: 'GSTIN', defaultTaxRate: 18, splitTax: true, upi: true, priceFactor: 1, locale: 'en-IN' },
  GB: { code: 'GB', name: 'United Kingdom', currency: 'GBP', symbol: '£', indianGrouping: false, distance: 'mi', taxName: 'VAT', taxIdLabel: 'VAT number', defaultTaxRate: 20, splitTax: false, upi: false, priceFactor: 0.12, locale: 'en-GB' },
  US: { code: 'US', name: 'United States', currency: 'USD', symbol: '$', indianGrouping: false, distance: 'mi', taxName: 'Sales tax', taxIdLabel: 'Tax ID (EIN)', defaultTaxRate: 0, splitTax: false, upi: false, priceFactor: 0.15, locale: 'en-US' },
  AU: { code: 'AU', name: 'Australia', currency: 'AUD', symbol: 'A$', indianGrouping: false, distance: 'km', taxName: 'GST', taxIdLabel: 'ABN', defaultTaxRate: 10, splitTax: false, upi: false, priceFactor: 0.2, locale: 'en-AU' },
  NZ: { code: 'NZ', name: 'New Zealand', currency: 'NZD', symbol: 'NZ$', indianGrouping: false, distance: 'km', taxName: 'GST', taxIdLabel: 'GST number', defaultTaxRate: 15, splitTax: false, upi: false, priceFactor: 0.2, locale: 'en-NZ' },
  CA: { code: 'CA', name: 'Canada', currency: 'CAD', symbol: 'C$', indianGrouping: false, distance: 'km', taxName: 'GST/HST', taxIdLabel: 'Business number', defaultTaxRate: 5, splitTax: false, upi: false, priceFactor: 0.18, locale: 'en-CA' },
  IE: { code: 'IE', name: 'Ireland', currency: 'EUR', symbol: '€', indianGrouping: false, distance: 'km', taxName: 'VAT', taxIdLabel: 'VAT number', defaultTaxRate: 23, splitTax: false, upi: false, priceFactor: 0.13, locale: 'en-IE' },
  AE: { code: 'AE', name: 'UAE', currency: 'AED', symbol: 'AED ', indianGrouping: false, distance: 'km', taxName: 'VAT', taxIdLabel: 'TRN', defaultTaxRate: 5, splitTax: false, upi: false, priceFactor: 0.5, locale: 'en-AE' },
  ZA: { code: 'ZA', name: 'South Africa', currency: 'ZAR', symbol: 'R', indianGrouping: false, distance: 'km', taxName: 'VAT', taxIdLabel: 'VAT number', defaultTaxRate: 15, splitTax: false, upi: false, priceFactor: 1.5, locale: 'en-ZA' },
  OTHER: { code: 'OTHER', name: 'Other country', currency: 'USD', symbol: '$', indianGrouping: false, distance: 'km', taxName: 'Tax', taxIdLabel: 'Tax number', defaultTaxRate: 0, splitTax: false, upi: false, priceFactor: 0.15, locale: 'en' },
};

export const COUNTRY_LIST: CountryCode[] = ['IN', 'GB', 'US', 'AU', 'NZ', 'CA', 'IE', 'AE', 'ZA', 'OTHER'];

let active: Region = REGIONS.IN;
let distanceOverride: 'km' | 'mi' | null = null;

export function setRegion(code: string | null | undefined, distance?: string | null) {
  active = REGIONS[(code as CountryCode) ?? 'IN'] ?? REGIONS.IN;
  distanceOverride = distance === 'km' || distance === 'mi' ? distance : null;
}
export const region = () => active;
export const currencySymbol = () => active.symbol.trim();
/** "km" or "mi" for this business. Distances are stored in this unit (a "km" price is per mile in the UK/US). */
export const distanceUnit = (): 'km' | 'mi' => distanceOverride ?? active.distance;
export const distanceWord = (plural = true) => (distanceUnit() === 'mi' ? (plural ? 'miles' : 'mile') : 'km');

/** Suggested price for setup cards: an Indian rupee amount turned into a round local amount. */
export function suggestPrice(rupees: number): number {
  if (active.code === 'IN') return rupees;
  const v = rupees * active.priceFactor;
  const step = v >= 200 ? 10 : v >= 20 ? 5 : v >= 5 ? 1 : 0.5;
  return Math.max(step, Math.round(v / step) * step);
}

/** Guess the country from the phone's locale, e.g. "en-GB" -> GB. */
export function guessCountry(locale: string | null | undefined, regionCode?: string | null): CountryCode {
  const r = (regionCode ?? locale?.split(/[-_]/)[1] ?? '').toUpperCase();
  return (COUNTRY_LIST as string[]).includes(r) ? (r as CountryCode) : 'IN';
}
