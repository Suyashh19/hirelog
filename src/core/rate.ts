import { distanceWord } from './region';

/** 'km' is "distance": km in most countries, miles where the business uses miles. */
export type RateUnit = 'hour' | 'day' | 'shift' | 'session' | 'trip' | 'km' | 'acre' | 'piece' | 'job';

export interface Rate {
  id: string;
  resourceId: string | null;
  customerId: string | null;
  variantName: string | null;
  unit: RateUnit;
  amountPaise: number;
  minSeconds: number;
  roundingSeconds: number;
  overtimeAfterSeconds: number | null;
  overtimeAmountPaise: number | null;
  visitChargePaise: number;
  /** RS-5 night rate: per-hour price inside a daily window (minutes since midnight; from > to wraps past midnight). */
  nightFromMin?: number | null;
  nightToMin?: number | null;
  nightAmountPaise?: number | null;
  /** RS-5 holiday rate: per-hour price on the business's holidays (weekly off-days and listed dates). */
  holidayAmountPaise?: number | null;
  /** Copied from the business settings when an entry is created, so the snapshot is self-contained. */
  holidays?: HolidayCalendar | null;
  /** Count units (km, day, trip…): the least that is billed once there is any work, e.g. 250 km a day. */
  minQuantity?: number | null;
  /** How the work is measured on the phone; null = the usual way for the unit (see defaultMeasure). */
  measure?: Measure | null;
  /** Monthly hire (hourly prices only): a fixed fee per bill that includes this many hours; extra hours at amountPaise. */
  monthlyFeePaise?: number | null;
  includedHours?: number | null;
}

/** Monthly hire: the fee plus any hours beyond what it includes, charged at the hourly price. */
export function hireCharge(totalSeconds: number, feePaise: number, includedHours: number, hourlyPaise: number) {
  const hours = Math.max(0, totalSeconds) / 3600;
  const extraHours = Math.max(0, Math.round((hours - Math.max(0, includedHours)) * 100) / 100);
  const extraPaise = Math.round(extraHours * hourlyPaise);
  return { hours: Math.round(hours * 100) / 100, extraHours, extraPaise, totalPaise: feePaise + extraPaise };
}
export const isHire = (r: Pick<Rate, 'unit' | 'monthlyFeePaise'> | null | undefined) => !!r && r.unit === 'hour' && (r.monthlyFeePaise ?? 0) > 0;

/**
 * How work is measured — chosen per price, never assumed:
 *  timer     — start/stop clock (hours; for days it counts the days out)
 *  gps       — the phone counts the km driven
 *  odometer  — km on the vehicle's dashboard at start and end
 *  hourmeter — the machine's own hours counter at start and end
 *  count     — no timer, type how many (jobs, trips, acres…)
 */
export type Measure = 'timer' | 'gps' | 'odometer' | 'hourmeter' | 'count';

export const defaultMeasure = (u: RateUnit): Measure => (u === 'hour' || u === 'day' ? 'timer' : u === 'km' ? 'gps' : 'count');

/** Which ways of measuring make sense for a unit (first = default). */
export const MEASURES_FOR: Record<RateUnit, Measure[]> = {
  hour: ['timer', 'hourmeter', 'count'], day: ['timer', 'count'], km: ['gps', 'odometer', 'count'],
  shift: ['count'], session: ['count'], trip: ['count'], acre: ['count'], piece: ['count'], job: ['count'],
};

export const MEASURE_TEXT: Record<Measure, { title: string; body: string; icon: string }> = {
  timer: { title: 'Timer', body: 'Tap Start when work begins and Stop when it ends', icon: 'timer-outline' },
  gps: { title: 'GPS on this phone', body: 'The phone counts the km driven during the trip', icon: 'map-marker-distance' },
  odometer: { title: 'Km on the dashboard', body: 'Note the km shown in the vehicle at start and at the end', icon: 'counter' },
  hourmeter: { title: "Machine's hours counter", body: 'Note the hours shown on the machine at start and at the end', icon: 'gauge' },
  count: { title: 'Type the number', body: 'No timer — enter how many after the work', icon: 'numeric' },
};

export const measureOf = (r: Pick<Rate, 'unit' | 'measure'> | null | undefined): Measure =>
  r?.measure && MEASURES_FOR[r.unit].includes(r.measure) ? r.measure : defaultMeasure(r?.unit ?? 'hour');

/** What the main button does for this way of measuring. */
export type CaptureMode = 'timer' | 'odometer' | 'count';
export const captureMode = (u: RateUnit, m?: Measure | null): CaptureMode => {
  const mm = m && MEASURES_FOR[u].includes(m) ? m : defaultMeasure(u);
  if (mm === 'count') return 'count';
  if (mm === 'gps' || mm === 'odometer') return 'odometer';
  return 'timer';
};

/** Rental days from elapsed time: any started day counts, at least 1. */
export const daysFromSeconds = (s: number) => Math.max(1, Math.ceil(Math.max(0, s) / 86400));

/** Words for each unit. "km" follows the business's country: it reads "mile/miles" in the UK and US. */
export const UNIT_LABEL: Record<RateUnit, { one: string; many: string }> = {
  hour: { one: 'hour', many: 'hours' }, day: { one: 'day', many: 'days' }, shift: { one: 'shift', many: 'shifts' },
  session: { one: 'session', many: 'sessions' }, trip: { one: 'trip', many: 'trips' },
  km: { get one() { return distanceWord(false); }, get many() { return distanceWord(true); } },
  acre: { one: 'acre', many: 'acres' }, piece: { one: 'piece', many: 'pieces' }, job: { one: 'job', many: 'jobs' },
};

/** weekdays: 0 = Sunday … 6 = Saturday. dates: "YYYY-MM-DD" (one day) or "MM-DD" (every year). */
export interface HolidayCalendar {
  weekdays: number[];
  dates: string[];
}

export const RATE_UNITS: RateUnit[] = ['hour', 'day', 'shift', 'session', 'trip', 'km', 'acre', 'piece', 'job'];
export const isTimeBased = (u: RateUnit) => u === 'hour';

/**
 * Most specific wins: resource+customer+variant > resource+customer > resource+variant > resource > default.
 * A rate whose resource/customer/variant is set but doesn't match is not eligible.
 */
export function resolveRate(
  rates: Rate[],
  q: { resourceId: string; customerId?: string | null; variantName?: string | null },
): Rate | null {
  let best: Rate | null = null;
  let bestScore = -1;
  for (const r of rates) {
    if (r.resourceId && r.resourceId !== q.resourceId) continue;
    if (r.customerId && r.customerId !== (q.customerId ?? null)) continue;
    if (r.variantName && r.variantName !== (q.variantName ?? null)) continue;
    const score = (r.resourceId ? 4 : 0) + (r.customerId ? 8 : 0) + (r.variantName ? 2 : 0);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

export interface AmountResult {
  billableSeconds: number;
  quantity: number;
  amountPaise: number;
}

const pad2 = (n: number) => n.toString().padStart(2, '0');

/** True when the local calendar day of `ms` is a weekly off-day or a listed holiday. */
export function isHoliday(cal: HolidayCalendar | null | undefined, ms: number): boolean {
  if (!cal) return false;
  const d = new Date(ms);
  if (cal.weekdays.includes(d.getDay())) return true;
  const md = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const ymd = `${d.getFullYear()}-${md}`;
  return cal.dates.includes(md) || cal.dates.includes(ymd);
}

/** "26-01, 15/08/2027, 2-10" -> ["01-26", "2027-08-15", "10-02"] (DD-MM repeats yearly). Returns null if any part is invalid. */
export function parseHolidayDates(input: string): string[] | null {
  const out: string[] = [];
  for (const raw of input.split(/[,;\n]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const m = t.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}))?$/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    if (m[3]) {
      const y = parseInt(m[3], 10);
      const check = new Date(y, mon - 1, day);
      if (check.getMonth() !== mon - 1) return null; // e.g. 31-04
      out.push(`${y}-${pad2(mon)}-${pad2(day)}`);
    } else {
      if (day > new Date(2024, mon, 0).getDate()) return null; // 2024 is a leap year, so 29-02 is allowed
      out.push(`${pad2(mon)}-${pad2(day)}`);
    }
  }
  return [...new Set(out)];
}

/** ["01-26", "2027-08-15"] -> "26-01, 15-08-2027" (the format parseHolidayDates reads). */
export function formatHolidayDates(dates: string[]): string {
  return dates
    .map((s) => {
      const p = s.split('-');
      return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : `${p[1]}-${p[0]}`;
    })
    .join(', ');
}

const hasNight = (r: Rate) =>
  !!r.nightAmountPaise && r.nightFromMin != null && r.nightToMin != null && r.nightFromMin !== r.nightToMin;
const hasHoliday = (r: Rate) => !!r.holidayAmountPaise && !!r.holidays && (r.holidays.weekdays.length > 0 || r.holidays.dates.length > 0);
export const hasTimeOfDayPricing = (r: Rate) => isTimeBased(r.unit) && (hasNight(r) || hasHoliday(r));

function inNight(r: Rate, minuteOfDay: number) {
  const from = r.nightFromMin!;
  const to = r.nightToMin!;
  return from < to ? minuteOfDay >= from && minuteOfDay < to : minuteOfDay >= from || minuteOfDay < to;
}

/** Per-hour price for the moment `ms`: holiday beats night beats the normal rate. */
function priceAt(r: Rate, ms: number): number {
  if (hasHoliday(r) && isHoliday(r.holidays, ms)) return r.holidayAmountPaise!;
  if (hasNight(r)) {
    const d = new Date(ms);
    if (inNight(r, d.getHours() * 60 + d.getMinutes())) return r.nightAmountPaise!;
  }
  return r.amountPaise;
}

/**
 * Splits [startMs, endMs) at local midnights and night-window edges.
 * Each piece has one price. Returns [seconds, price per hour] in time order.
 */
export function priceSegments(r: Rate, startMs: number, endMs: number): [number, number][] {
  const out: [number, number][] = [];
  let t = startMs;
  let guard = 0;
  while (t < endMs && guard++ < 10000) {
    const d = new Date(t);
    const y = d.getFullYear(), mo = d.getMonth(), da = d.getDate();
    const cuts = [new Date(y, mo, da + 1).getTime()];
    if (hasNight(r)) {
      cuts.push(new Date(y, mo, da, 0, r.nightFromMin!).getTime(), new Date(y, mo, da, 0, r.nightToMin!).getTime());
    }
    const next = Math.min(endMs, ...cuts.filter((c) => c > t));
    const price = priceAt(r, t);
    const secs = (next - t) / 1000;
    const last = out[out.length - 1];
    if (last && last[1] === price) last[0] += secs;
    else out.push([secs, price]);
    t = next;
  }
  return out;
}

/**
 * Time-based (hour): worked = elapsed - break; round UP to the rounding step, apply the minimum;
 * hours beyond the overtime threshold use the overtime rate. Visit charge is added once.
 * Night/holiday (RS-5): when the start time is known, each part of the entry is priced by when it happened.
 * Break, rounding and minimum time are spread over the parts in proportion to their length;
 * past the overtime threshold a part costs the higher of its own price and the overtime price.
 * Quantity-based units: amount = quantity * rate (+ visit charge).
 */
export function computeAmount(
  rate: Rate,
  input: { workedSeconds?: number; breakSeconds?: number; quantity?: number; startedAt?: number | null; visitOnly?: boolean },
): AmountResult {
  const visit = rate.visitChargePaise || 0;
  // Inspection or visit with no work done: the visit charge alone
  if (input.visitOnly) return { billableSeconds: 0, quantity: 0, amountPaise: visit };
  // Monthly hire: the hours are counted here, the money is worked out once per bill (fee + extra hours)
  if (isHire(rate)) {
    const secs = Math.max(0, (input.workedSeconds ?? 0) - (input.breakSeconds ?? 0));
    return { billableSeconds: secs, quantity: secs / 3600, amountPaise: 0 };
  }
  if (!isTimeBased(rate.unit)) {
    let qty = input.quantity ?? 1;
    if (qty > 0 && rate.minQuantity && rate.minQuantity > qty) qty = rate.minQuantity;
    return { billableSeconds: 0, quantity: qty, amountPaise: Math.round(qty * rate.amountPaise) + (qty > 0 ? visit : 0) };
  }
  const elapsed = Math.max(0, input.workedSeconds ?? 0);
  let secs = Math.max(0, elapsed - (input.breakSeconds ?? 0));
  if (rate.roundingSeconds > 0) secs = Math.ceil(secs / rate.roundingSeconds) * rate.roundingSeconds;
  if (secs > 0 && rate.minSeconds > 0) secs = Math.max(secs, rate.minSeconds);
  const ot = rate.overtimeAfterSeconds;
  const otOn = ot !== null && ot > 0;
  const otRate = rate.overtimeAmountPaise ?? rate.amountPaise;
  let amount: number;
  if (secs > 0 && elapsed > 0 && input.startedAt != null && hasTimeOfDayPricing(rate)) {
    const scale = secs / elapsed;
    let done = 0;
    let sum = 0; // paise * seconds per hour
    for (const [segSecs, price] of priceSegments(rate, input.startedAt, input.startedAt + elapsed * 1000)) {
      const part = segSecs * scale;
      const normalPart = otOn ? Math.max(0, Math.min(part, ot! - done)) : part;
      const otPart = part - normalPart;
      const otPrice = price === rate.amountPaise ? otRate : Math.max(price, otRate);
      sum += normalPart * price + otPart * otPrice;
      done += part;
    }
    amount = Math.round(sum / 3600);
  } else if (otOn && secs > ot!) {
    amount = Math.round((ot! * rate.amountPaise + (secs - ot!) * otRate) / 3600);
  } else {
    amount = Math.round((secs * rate.amountPaise) / 3600);
  }
  return { billableSeconds: secs, quantity: secs / 3600, amountPaise: amount + (secs > 0 ? visit : 0) };
}
