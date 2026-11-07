export type PlanId = 'free' | 'pro' | 'business';
export type Period = 'monthly' | 'sixmonth' | 'yearly';

/** India prices in ₹, from the PRD. Google Play's localised prices replace these when the store is reachable. */
export const PRICES: Record<'pro' | 'business', Record<Period, number>> = {
  pro: { monthly: 149, sixmonth: 699, yearly: 999 },
  business: { monthly: 399, sixmonth: 1899, yearly: 2999 },
};
export const PERIOD_MONTHS: Record<Period, number> = { monthly: 1, sixmonth: 6, yearly: 12 };
export const PERIOD_LABEL: Record<Period, string> = { monthly: 'Monthly', sixmonth: '6 months', yearly: 'Yearly' };

/** Outside India (US dollars); Google Play shows each buyer the price in their own currency at checkout. */
export const PRICES_USD: Record<'pro' | 'business', Record<Period, number>> = {
  pro: { monthly: 9.99, sixmonth: 49.99, yearly: 79.99 },
  business: { monthly: 24.99, sixmonth: 119.99, yearly: 199.99 },
};
const table = (india: boolean) => (india ? PRICES : PRICES_USD);
/** Plan price as text, e.g. "₹999" or "$79.99". */
export const priceText = (plan: 'pro' | 'business', p: Period, india: boolean) =>
  india ? `₹${PRICES[plan][p].toLocaleString('en-IN')}` : `$${PRICES_USD[plan][p].toFixed(2)}`;
export const perMonthText = (plan: 'pro' | 'business', p: Period, india: boolean) => {
  const v = table(india)[plan][p] / PERIOD_MONTHS[p];
  return india ? `₹${Math.round(v)}` : `$${v.toFixed(2)}`;
};
export const perMonth = (plan: 'pro' | 'business', p: Period) => Math.round(PRICES[plan][p] / PERIOD_MONTHS[p]);
export const savedPercent = (plan: 'pro' | 'business', p: Period, india = true) =>
  Math.round((1 - table(india)[plan][p] / (table(india)[plan].monthly * PERIOD_MONTHS[p])) * 100);

export const LIMITS: Record<PlanId, { resources: number | null; customers: number | null; pdfPerMonth: number | null; historyDays: number | null }> = {
  free: { resources: 1, customers: 5, pdfPerMonth: 10, historyDays: 60 },
  pro: { resources: 5, customers: null, pdfPerMonth: null, historyDays: null },
  business: { resources: 15, customers: null, pdfPerMonth: null, historyDays: null },
};

export type Feature =
  | 'batch-billing' | 'reminders' | 'exports' | 'rate-rules' | 'rate-overrides' | 'remove-footer' | 'multi-timer' | 'multi-device'
  | 'team' | 'photo-proof' | 'insights' | 'materials' | 'gst' | 'confirm' | 'quotes' | 'expenses' | 'profit' | 'accounting-export' | 'field-area';

export const FEATURE_MIN_PLAN: Record<Feature, PlanId> = {
  'batch-billing': 'pro', reminders: 'pro', exports: 'pro', 'rate-rules': 'pro', 'rate-overrides': 'pro', insights: 'pro',
  materials: 'pro', gst: 'business',
  // proof and getting paid sell Pro; team, photos, profit and accounting exports are Business
  confirm: 'pro', quotes: 'pro', expenses: 'pro', 'field-area': 'pro', profit: 'business', 'accounting-export': 'business',
  'remove-footer': 'pro', 'multi-timer': 'pro', 'multi-device': 'pro', team: 'business', 'photo-proof': 'business',
};

export const PRODUCT_ID: Record<'pro' | 'business', string> = { pro: 'pro', business: 'business' };

/** Who each plan is for (PRD section 4). */
export const PLAN_FOR: Record<PlanId, string> = {
  free: 'Trying it out, or very small work',
  pro: 'Individuals: trades, tutors, freelancers, drivers',
  business: 'Owners with workers, machines, vehicles or rooms',
};

const lim = (n: number | null, unit: string) => (n === null ? 'Unlimited' : `${n}${unit ? ' ' + unit : ''}`);

/**
 * The plan comparison shown on the plans screen (PRD section 4). `soon` marks features that are part of
 * the plan but not built yet, so nobody pays for something they cannot use today.
 */
export const PLAN_TABLE: { group: string; rows: { label: string; free: string; pro: string; business: string; soon?: boolean }[] }[] = [
  {
    group: 'Work',
    rows: [
      { label: 'Timer and manual entries', free: 'Unlimited', pro: 'Unlimited', business: 'Unlimited' },
      { label: 'Resources (you, workers, machines, vehicles, rooms)', free: String(LIMITS.free.resources), pro: String(LIMITS.pro.resources), business: String(LIMITS.business.resources) },
      { label: 'Services / rates per resource', free: '3', pro: 'Unlimited', business: 'Unlimited' },
      { label: 'Timers running at once', free: '1', pro: 'Several', business: 'Several' },
      { label: 'Rate rules: overtime, minimum time, rounding, visit charge, night and holiday', free: 'One plain rate', pro: 'All', business: 'All' },
      { label: 'Special rate for a customer', free: '—', pro: 'Yes', business: 'Yes' },
      { label: 'Machine hour-meter readings on entries and bills', free: 'Yes', pro: 'Yes', business: 'Yes' },
      { label: 'Materials and extra charges (quantity × price) on jobs', free: '—', pro: 'Yes', business: 'Yes' },
    ],
  },
  {
    group: 'Customers and bills',
    rows: [
      { label: 'Active customers', free: lim(LIMITS.free.customers, ''), pro: lim(LIMITS.pro.customers, ''), business: lim(LIMITS.business.customers, '') },
      { label: 'Ledger and payments', free: 'Yes', pro: 'Yes', business: 'Yes' },
      { label: 'WhatsApp text bills', free: 'Unlimited', pro: 'Unlimited', business: 'Unlimited' },
      { label: 'PDF bills', free: `${LIMITS.free.pdfPerMonth} a month, with footer`, pro: 'Unlimited, no footer', business: 'Unlimited, no footer' },
      { label: 'Your logo and UPI QR on bills', free: '—', pro: 'Yes', business: 'Yes' },
      { label: 'Bill everyone for the month in one tap', free: '—', pro: 'Yes', business: 'Yes' },
      { label: 'Payment reminders and "To collect" list', free: 'Manual share', pro: 'One tap, with UPI link', business: 'One tap, with UPI link' },
      { label: 'Tax invoices (GST, VAT, sales tax), tax numbers, invoice prefix, due date', free: '—', pro: '—', business: 'Yes' },
      { label: 'TDS on bills (India)', free: 'Yes', pro: 'Yes', business: 'Yes' },
    ],
  },
  {
    group: 'Reports and data',
    rows: [
      { label: 'Visible history', free: `Last ${LIMITS.free.historyDays} days (older kept, locked)`, pro: 'Full', business: 'Full' },
      { label: 'Reports', free: 'Totals for the period', pro: 'Charts, hourly rate, forecast, by customer and resource', business: 'Same as Pro' },
      { label: 'Export to Excel / CSV', free: '—', pro: 'Yes', business: 'Yes' },
      { label: 'Backup and phones', free: 'Cloud backup', pro: 'Sync across phones', business: 'Sync across phones' },
    ],
  },
  {
    group: 'Team and proof',
    rows: [
      { label: 'Live / manual / edited labels and clock-change flag', free: 'Yes', pro: 'Yes', business: 'Yes' },
      { label: 'Customer confirms the work on their phone (link)', free: '—', pro: 'Yes', business: 'Yes' },
      { label: 'GPS trips with start and end place', free: 'Yes', pro: 'Yes', business: 'Yes' },
      { label: 'Photos on jobs, shown on the bill', free: '—', pro: '—', business: 'Yes' },
      { label: 'Team: operators and drivers log on their own phone', free: '—', pro: '—', business: 'Up to 10' },
      { label: 'Edit approvals and audit log', free: '—', pro: '—', business: 'Yes', soon: true },
    ],
  },
  {
    group: 'Money',
    rows: [
      { label: 'Quotes that turn into jobs', free: '—', pro: 'Yes', business: 'Yes' },
      { label: 'Monthly hire (fee includes hours, extra hours charged)', free: '—', pro: 'Yes', business: 'Yes' },
      { label: 'Automatic payment reminders', free: '—', pro: 'Yes', business: 'Yes' },
      { label: 'Pay link on bills (UPI, Stripe, PayPal…)', free: 'Yes', pro: 'Yes', business: 'Yes' },
      { label: 'Expenses (fuel, repairs, pay)', free: '—', pro: 'Yes', business: 'Yes' },
      { label: 'Profit per machine, vehicle or service', free: '—', pro: '—', business: 'Yes' },
      { label: 'Export for Xero, QuickBooks, Tally', free: '—', pro: '—', business: 'Yes' },
      { label: 'Measure field acres with GPS', free: '—', pro: 'Yes', business: 'Yes' },
      { label: 'Full data backup (JSON)', free: 'Yes', pro: 'Yes', business: 'Yes' },
    ],
  },
  {
    group: 'Always',
    rows: [{ label: 'Ads', free: 'None', pro: 'None', business: 'None' }],
  },
];

export const PAYWALL_COPY: Record<string, { title: string; body: string; plan: 'pro' | 'business' }> = {
  customers: { title: 'You have reached 5 customers', body: 'Pro lets you add unlimited customers. Your data is safe either way.', plan: 'pro' },
  resources: { title: 'Add more to earn more', body: 'Free covers one resource. Pro covers 5, Business up to 15.', plan: 'pro' },
  'resources-business': { title: 'Time to move up to Business', body: 'Business supports up to 15 resources and a team of 10.', plan: 'business' },
  pdf: { title: 'You have used your 10 free PDF bills', body: 'Pro gives unlimited PDF bills with your UPI QR and no footer.', plan: 'pro' },
  footer: { title: 'Remove the footer', body: 'Pro bills have no "Made with" footer.', plan: 'pro' },
  'batch-billing': { title: 'Bill everyone in one tap', body: 'Pro creates every customer\'s bill for the month at once.', plan: 'pro' },
  reminders: { title: 'One-tap payment reminders', body: 'Pro sends WhatsApp reminders with your UPI link.', plan: 'pro' },
  'rate-overrides': { title: 'Special rates per customer', body: 'Pro lets you charge a different rate to a particular customer.', plan: 'pro' },
  'rate-rules': { title: 'Rate rules', body: 'Minimum time, rounding, overtime and visit charge are part of Pro.', plan: 'pro' },
  'multi-timer': { title: 'Run several timers at once', body: 'Pro lets you time more than one resource together.', plan: 'pro' },
  variants: { title: 'More services at different prices', body: 'Free allows 3 named rates per resource. Pro has no limit.', plan: 'pro' },
  exports: { title: 'Export your data', body: 'Pro exports your entries to Excel or CSV.', plan: 'pro' },
  insights: { title: 'Reports for any period', body: 'Pro adds earnings charts, the comparison with the last period, your earnings per hour, a month-end estimate and totals by customer and resource.', plan: 'pro' },
  team: { title: 'Work with a team', body: 'Business lets you invite up to 10 members.', plan: 'business' },
  materials: { title: 'Materials and extra charges', body: 'Pro lets you add parts, materials, travel and other charges to any job, with quantity and price, and shows them on the bill.', plan: 'pro' },
  confirm: { title: 'Customer confirmation', body: 'Pro sends the customer a link to confirm the hours, km or job on their phone. Confirmed work is shown on the bill, so there is nothing to argue about.', plan: 'pro' },
  photos: { title: 'Photo proof', body: 'Business adds photos to jobs — the hours counter, the dashboard, the site or a receipt.', plan: 'business' },
  quotes: { title: 'Quotes', body: 'Pro lets you send a quote and turn it into a job when the customer agrees.', plan: 'pro' },
  expenses: { title: 'Expenses', body: 'Pro records fuel, repairs and other costs for each machine or vehicle.', plan: 'pro' },
  profit: { title: 'Profit per machine', body: 'Business shows what each machine, vehicle or service really earns after fuel, repairs and other costs.', plan: 'business' },
  'accounting-export': { title: 'Export for your accountant', body: 'Business exports invoices for Xero, QuickBooks or Tally.', plan: 'business' },
  'field-area': { title: 'Measure fields', body: 'Pro measures a field by walking or driving around it, and bills it per acre.', plan: 'pro' },
  gst: { title: 'GST tax invoices', body: 'Business turns your bills into GST tax invoices: your GSTIN and your client\'s, CGST + SGST or IGST, invoice numbers and due dates.', plan: 'business' },
  default: { title: 'Plans', body: 'Free is enough to start. Pro and Business remove the limits and add the tools below.', plan: 'pro' },
};
