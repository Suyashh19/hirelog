import { describe, expect, it } from 'vitest';
import { formatINR, parseRupees, groupIndian, formatMoney, parseMoney } from './money';
import { distanceUnit, guessCountry, setRegion, suggestPrice } from './region';
import { parseDurationOrRange, parseClock, formatDuration } from './time';
import { computeAmount, resolveRate, Rate, isHoliday, parseHolidayDates, formatHolidayDates, captureMode, daysFromSeconds, measureOf, hireCharge } from './rate';
import { isClockTampered } from './tamper';
import { allocatePayments } from './ledger';
import { cleanGstin, gstSplit, meterHours } from './gst';
import { addFix, haversineM, metresToKm, m2ToAcres, m2ToHectares, polygonAreaM2 } from './geo';

const base: Rate = {
  id: 'r', resourceId: null, customerId: null, variantName: null, unit: 'hour',
  amountPaise: 50000, minSeconds: 0, roundingSeconds: 0, overtimeAfterSeconds: null,
  overtimeAmountPaise: null, visitChargePaise: 0,
};

describe('regions', () => {
  it('formats in the business currency', () => {
    setRegion('GB');
    expect(formatMoney(12345600)).toBe('£123,456');
    expect(formatMoney(1250)).toBe('£12.50');
    expect(distanceUnit()).toBe('mi');
    setRegion('AU');
    expect(formatMoney(500000)).toBe('A$5,000');
    expect(distanceUnit()).toBe('km');
    setRegion('US', 'km');
    expect(distanceUnit()).toBe('km');
    setRegion('IN');
    expect(formatMoney(12345600)).toBe('₹1,23,456');
  });
  it('parses money with any symbol', () => {
    expect(parseMoney('£12.50')).toBe(1250);
    expect(parseMoney('A$1,200')).toBe(120000);
  });
  it('suggests local prices and guesses the country', () => {
    setRegion('GB');
    expect(suggestPrice(300)).toBe(35);
    setRegion('IN');
    expect(suggestPrice(300)).toBe(300);
    expect(guessCountry('en-GB')).toBe('GB');
    expect(guessCountry('hi-IN')).toBe('IN');
    expect(guessCountry('fr-FR')).toBe('IN');
  });
});

describe('money', () => {
  it('groups Indian style', () => {
    expect(groupIndian(100000)).toBe('1,00,000');
    expect(groupIndian(999)).toBe('999');
    expect(groupIndian(12345678)).toBe('1,23,45,678');
  });
  it('formats paise', () => {
    expect(formatINR(12345600)).toBe('₹1,23,456');
    expect(formatINR(25050)).toBe('₹250.50');
    expect(formatINR(-5000)).toBe('-₹50');
    expect(formatINR(0)).toBe('₹0');
  });
  it('parses rupees', () => {
    expect(parseRupees('1,200')).toBe(120000);
    expect(parseRupees('250.5')).toBe(25050);
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees('')).toBeNull();
  });
});

describe('time parsing', () => {
  it('range', () => expect(parseDurationOrRange('9:00 to 13:30')?.minutes).toBe(270));
  it('range pm', () => expect(parseDurationOrRange('9am-1:30pm')?.minutes).toBe(270));
  it('overnight', () => expect(parseDurationOrRange('22:00 to 2:00')?.minutes).toBe(240));
  it('decimal hours', () => expect(parseDurationOrRange('4.5 hrs')?.minutes).toBe(270));
  it('plain number is hours', () => expect(parseDurationOrRange('2')?.minutes).toBe(120));
  it('h m', () => expect(parseDurationOrRange('2h 30m')?.minutes).toBe(150));
  it('minutes', () => expect(parseDurationOrRange('90 min')?.minutes).toBe(90));
  it('garbage', () => expect(parseDurationOrRange('hello')).toBeNull());
  it('clock', () => {
    expect(parseClock('9:30pm')).toBe(21 * 60 + 30);
    expect(parseClock('25:00')).toBeNull();
  });
  it('format', () => expect(formatDuration(5400)).toBe('1h 30m'));
});

describe('rate engine', () => {
  it('simple hourly', () => {
    expect(computeAmount(base, { workedSeconds: 5400 }).amountPaise).toBe(75000);
  });
  it('break is deducted', () => {
    expect(computeAmount(base, { workedSeconds: 7200, breakSeconds: 1800 }).billableSeconds).toBe(5400);
  });
  it('rounds up and applies minimum', () => {
    const r = { ...base, roundingSeconds: 900, minSeconds: 3600 };
    expect(computeAmount(r, { workedSeconds: 1000 }).billableSeconds).toBe(3600);
    expect(computeAmount(r, { workedSeconds: 4000 }).billableSeconds).toBe(4500);
  });
  it('overtime', () => {
    const r = { ...base, overtimeAfterSeconds: 8 * 3600, overtimeAmountPaise: 75000 };
    expect(computeAmount(r, { workedSeconds: 10 * 3600 }).amountPaise).toBe(8 * 50000 + 2 * 75000);
  });
  it('visit charge once, not on zero work', () => {
    const r = { ...base, visitChargePaise: 20000 };
    expect(computeAmount(r, { workedSeconds: 3600 }).amountPaise).toBe(70000);
    expect(computeAmount(r, { workedSeconds: 0 }).amountPaise).toBe(0);
  });
  it('quantity units', () => {
    expect(computeAmount({ ...base, unit: 'km', amountPaise: 1500 }, { quantity: 40 }).amountPaise).toBe(60000);
  });
  it('most specific rate wins', () => {
    const def = { ...base, id: 'def' };
    const res = { ...base, id: 'res', resourceId: 'A' };
    const resVar = { ...base, id: 'resVar', resourceId: 'A', variantName: 'AC' };
    const resCust = { ...base, id: 'resCust', resourceId: 'A', customerId: 'C' };
    const all = [def, res, resVar, resCust];
    expect(resolveRate(all, { resourceId: 'A' })?.id).toBe('res');
    expect(resolveRate(all, { resourceId: 'A', variantName: 'AC' })?.id).toBe('resVar');
    expect(resolveRate(all, { resourceId: 'A', customerId: 'C' })?.id).toBe('resCust');
    expect(resolveRate(all, { resourceId: 'B' })?.id).toBe('def');
    expect(resolveRate([res], { resourceId: 'B' })).toBeNull();
  });
});

describe('night and holiday rate (RS-5)', () => {
  const H = 3600;
  // ₹500/h normal, ₹750/h from 22:00 to 06:00, ₹1000/h on Sundays and 26 Jan
  const night: Rate = { ...base, nightFromMin: 22 * 60, nightToMin: 6 * 60, nightAmountPaise: 75000 };
  const both: Rate = { ...night, holidayAmountPaise: 100000, holidays: { weekdays: [0], dates: ['01-26'] } };
  const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime();

  it('charges the night price only for the night hours', () => {
    // Wed 4 Nov 2026, 20:00 to 24:00: 2h normal + 2h night
    expect(computeAmount(night, { workedSeconds: 4 * H, startedAt: at(2026, 11, 4, 20) }).amountPaise).toBe(2 * 50000 + 2 * 75000);
  });
  it('night window ends in the morning', () => {
    // 04:00 to 08:00: 2h night + 2h normal
    expect(computeAmount(night, { workedSeconds: 4 * H, startedAt: at(2026, 11, 4, 4) }).amountPaise).toBe(2 * 75000 + 2 * 50000);
  });
  it('holiday starts at midnight and beats night', () => {
    // Sat 7 Nov 23:00 to Sun 8 Nov 01:00: 1h night (Sat) + 1h holiday (Sun)
    expect(computeAmount(both, { workedSeconds: 2 * H, startedAt: at(2026, 11, 7, 23) }).amountPaise).toBe(75000 + 100000);
  });
  it('yearly holiday date', () => {
    expect(computeAmount(both, { workedSeconds: 2 * H, startedAt: at(2027, 1, 26, 10) }).amountPaise).toBe(2 * 100000);
    expect(computeAmount(both, { workedSeconds: 2 * H, startedAt: at(2027, 1, 27, 10) }).amountPaise).toBe(2 * 50000);
  });
  it('break is spread over the parts', () => {
    // 20:00 to 24:00 with a 1h break: 3h billed, 1.5h normal + 1.5h night
    expect(computeAmount(night, { workedSeconds: 4 * H, breakSeconds: H, startedAt: at(2026, 11, 4, 20) }).amountPaise).toBe(1.5 * 50000 + 1.5 * 75000);
  });
  it('overtime uses the higher price', () => {
    // overtime after 2h at ₹600; 20:00 to 24:00 -> 2h normal, then 2h night past overtime at max(750, 600)
    const r = { ...night, overtimeAfterSeconds: 2 * H, overtimeAmountPaise: 60000 };
    expect(computeAmount(r, { workedSeconds: 4 * H, startedAt: at(2026, 11, 4, 20) }).amountPaise).toBe(2 * 50000 + 2 * 75000);
    // 08:00 to 12:00, all daytime -> overtime price for the last 2h, same as before
    expect(computeAmount(r, { workedSeconds: 4 * H, startedAt: at(2026, 11, 4, 8) }).amountPaise).toBe(2 * 50000 + 2 * 60000);
  });
  it('without a start time the normal rate is used', () => {
    expect(computeAmount(both, { workedSeconds: 2 * H }).amountPaise).toBe(2 * 50000);
  });
  it('holiday rate is ignored when no holidays are set', () => {
    const r = { ...base, holidayAmountPaise: 100000, holidays: { weekdays: [], dates: [] } };
    expect(computeAmount(r, { workedSeconds: H, startedAt: at(2026, 11, 8, 10) }).amountPaise).toBe(50000);
  });
  it('isHoliday', () => {
    expect(isHoliday({ weekdays: [0], dates: [] }, at(2026, 11, 8, 12))).toBe(true);
    expect(isHoliday({ weekdays: [], dates: ['2026-11-09'] }, at(2026, 11, 9, 12))).toBe(true);
    expect(isHoliday({ weekdays: [], dates: ['2026-11-09'] }, at(2027, 11, 9, 12))).toBe(false);
  });
  it('parses and formats holiday dates', () => {
    expect(parseHolidayDates('26-01, 15/08/2027, 2.10')).toEqual(['01-26', '2027-08-15', '10-02']);
    expect(parseHolidayDates('')).toEqual([]);
    expect(parseHolidayDates('31-04')).toBeNull();
    expect(parseHolidayDates('29-02-2027')).toBeNull();
    expect(parseHolidayDates('hello')).toBeNull();
    expect(formatHolidayDates(['01-26', '2027-08-15'])).toBe('26-01, 15-08-2027');
  });
});

describe('capture modes and count units', () => {
  it('picks how each unit is captured', () => {
    expect(captureMode('hour')).toBe('timer');
    expect(captureMode('day')).toBe('timer');
    expect(captureMode('km')).toBe('odometer');
    expect(captureMode('job')).toBe('count');
    expect(captureMode('acre')).toBe('count');
    // the chosen way of measuring wins when it fits the unit
    expect(captureMode('hour', 'count')).toBe('count');
    expect(captureMode('km', 'count')).toBe('count');
    expect(captureMode('job', 'timer')).toBe('count'); // timer makes no sense for a fixed job
  });
  it('measureOf falls back to the usual way', () => {
    expect(measureOf({ unit: 'km', measure: null })).toBe('gps');
    expect(measureOf({ unit: 'km', measure: 'odometer' })).toBe('odometer');
    expect(measureOf({ unit: 'hour', measure: 'gps' })).toBe('timer');
  });
  it('counts rental days', () => {
    expect(daysFromSeconds(0)).toBe(1);
    expect(daysFromSeconds(86400)).toBe(1);
    expect(daysFromSeconds(86401)).toBe(2);
    expect(daysFromSeconds(3 * 86400 - 60)).toBe(3);
  });
  it('minimum km per day', () => {
    const km: Rate = { ...base, unit: 'km', amountPaise: 1200, minQuantity: 250 };
    expect(computeAmount(km, { quantity: 180 }).amountPaise).toBe(250 * 1200);
    expect(computeAmount(km, { quantity: 300 }).amountPaise).toBe(300 * 1200);
    expect(computeAmount(km, { quantity: 0 }).amountPaise).toBe(0);
  });
  it('visit only charges the visit', () => {
    const r = { ...base, visitChargePaise: 15000 };
    expect(computeAmount(r, { visitOnly: true }).amountPaise).toBe(15000);
  });
});

describe('monthly hire', () => {
  it('fee covers the included hours, extra hours at the hourly price', () => {
    // ₹90,000 a month for 240 h, extra ₹450/h; 252.5 h used -> 12.5 h extra
    expect(hireCharge(252.5 * 3600, 9000000, 240, 45000)).toEqual({ hours: 252.5, extraHours: 12.5, extraPaise: 562500, totalPaise: 9562500 });
    expect(hireCharge(200 * 3600, 9000000, 240, 45000).totalPaise).toBe(9000000);
  });
  it('entries on a hire price carry hours but no money', () => {
    const r = { ...base, monthlyFeePaise: 9000000, includedHours: 240 };
    expect(computeAmount(r, { workedSeconds: 8 * 3600 })).toEqual({ billableSeconds: 8 * 3600, quantity: 8, amountPaise: 0 });
  });
});

describe('GPS distance', () => {
  const p = (lat: number, lon: number, t: number, acc: number | null = 8) => ({ lat, lon, t, acc });
  it('haversine ~111 m per 0.001° latitude', () => {
    expect(Math.round(haversineM(p(18.5, 73.8, 0), p(18.501, 73.8, 0)))).toBe(111);
  });
  it('adds real movement, ignores drift, bad fixes and jumps', () => {
    let s = addFix(0, null, p(18.5, 73.8, 0));
    s = addFix(s.totalM, s.last, p(18.501, 73.8, 30000)); // 111 m in 30 s
    expect(Math.round(s.totalM)).toBe(111);
    const drift = addFix(s.totalM, s.last, p(18.50105, 73.8, 40000)); // 5 m wobble
    expect(Math.round(drift.totalM)).toBe(111);
    const bad = addFix(s.totalM, s.last, p(18.6, 73.8, 50000, 120)); // poor accuracy
    expect(Math.round(bad.totalM)).toBe(111);
    const jump = addFix(s.totalM, s.last, p(18.6, 73.8, 31000)); // 11 km in 1 s
    expect(Math.round(jump.totalM)).toBe(111);
  });
  it('rounds to one decimal km', () => expect(metresToKm(12345)).toBe(12.3));
  it('field area: a 100 m × 100 m square is 1 hectare ≈ 2.47 acres', () => {
    const lat = 18.5, lon = 73.8;
    const dLat = 100 / 111320;                                  // 100 m north
    const dLon = 100 / (111320 * Math.cos((lat * Math.PI) / 180)); // 100 m east
    const sq = [{ lat, lon }, { lat, lon: lon + dLon }, { lat: lat + dLat, lon: lon + dLon }, { lat: lat + dLat, lon }];
    const a = polygonAreaM2(sq);
    expect(Math.abs(a - 10000)).toBeLessThan(100);
    expect(m2ToHectares(a)).toBeCloseTo(1, 1);
    expect(m2ToAcres(a)).toBeCloseTo(2.47, 1);
    expect(polygonAreaM2(sq.slice(0, 2))).toBe(0);
  });
});

describe('GST and meter', () => {
  const MH = '27AAPFU0939F1ZV'; // Maharashtra
  const KA = '29AAACC1206D1ZM'; // Karnataka
  it('validates GSTIN shape', () => {
    expect(cleanGstin(' 27aapfu0939f1zv ')).toBe(MH);
    expect(cleanGstin('27AAPFU0939F1Z')).toBeNull();
    expect(cleanGstin('')).toBeNull();
  });
  it('same state: CGST + SGST', () => {
    expect(gstSplit(100000, 18, MH, '27AABCU9603R1ZX')).toEqual({ interState: false, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0, taxPaise: 18000 });
  });
  it('no buyer GSTIN: treated as same state', () => {
    expect(gstSplit(100000, 18, MH, null).interState).toBe(false);
  });
  it('other state: IGST', () => {
    expect(gstSplit(100000, 18, MH, KA)).toEqual({ interState: true, cgstPaise: 0, sgstPaise: 0, igstPaise: 18000, taxPaise: 18000 });
  });
  it('odd paise split adds up', () => {
    const s = gstSplit(33333, 5, MH);
    expect(s.cgstPaise + s.sgstPaise).toBe(s.taxPaise);
  });
  it('meter hours', () => {
    expect(meterHours(1234.5, 1240)).toBe(5.5);
    expect(meterHours(1240, 1234.5)).toBeNull();
    expect(meterHours(null, 10)).toBeNull();
  });
});

describe('tamper', () => {
  it('flags clock set forward', () => {
    expect(isClockTampered({ wallStartMs: 0, wallEndMs: 3_600_000 * 3, uptimeStartMs: 1000, uptimeEndMs: 1000 + 3_600_000 })).toBe(true);
  });
  it('passes honest entry', () => {
    expect(isClockTampered({ wallStartMs: 0, wallEndMs: 3_600_000, uptimeStartMs: 5, uptimeEndMs: 5 + 3_601_000 })).toBe(false);
  });
  it('does not flag after reboot', () => {
    expect(isClockTampered({ wallStartMs: 0, wallEndMs: 9e6, uptimeStartMs: 9e9, uptimeEndMs: 100 })).toBe(false);
  });
});

describe('payment allocation', () => {
  const bills = [
    { id: 'b1', subtotalPaise: 100000, sortKey: 1, status: 'sent' },
    { id: 'b2', subtotalPaise: 50000, sortKey: 2, status: 'sent' },
    { id: 'd', subtotalPaise: 9, sortKey: 3, status: 'draft' },
  ];
  it('oldest first', () => {
    expect(allocatePayments(0, 120000, bills)).toEqual({ b1: 'paid', b2: 'partly_paid' });
    expect(allocatePayments(0, 0, bills)).toEqual({ b1: 'sent', b2: 'sent' });
    expect(allocatePayments(0, 150000, bills)).toEqual({ b1: 'paid', b2: 'paid' });
  });
  it('opening balance is paid first', () => {
    expect(allocatePayments(30000, 30000, bills)).toEqual({ b1: 'sent', b2: 'sent' });
  });
});
