/** Distance between two GPS points in metres (haversine). */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GeoPoint { lat: number; lon: number; t: number; acc: number | null }

/**
 * Adds a new GPS fix to a running distance, ignoring noise:
 *  - fixes worse than 50 m accuracy are skipped
 *  - moves shorter than the fix's own uncertainty (standing still, "GPS drift") are skipped
 *  - impossible jumps (faster than 200 km/h) are skipped
 * Returns the new total and the point to measure the next move from.
 */
export function addFix(totalM: number, last: GeoPoint | null, p: GeoPoint): { totalM: number; last: GeoPoint } {
  if (p.acc !== null && p.acc > 50) return { totalM, last: last ?? p };
  if (!last) return { totalM, last: p };
  const d = haversineM(last, p);
  const minMove = Math.max(15, p.acc ?? 15);
  if (d < minMove) return { totalM, last };
  const secs = Math.max(1, (p.t - last.t) / 1000);
  if (d / secs > 55) return { totalM, last }; // > ~200 km/h
  return { totalM: totalM + d, last: p };
}

/**
 * Area inside a walked/driven boundary, in square metres. Points are projected onto a flat plane around
 * their centre (accurate for fields; error is negligible below a few km across), then the shoelace formula.
 */
export function polygonAreaM2(points: { lat: number; lon: number }[]): number {
  if (points.length < 3) return 0;
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const R = 6371000;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = points.map((p) => [((p.lon * Math.PI) / 180) * R * k, ((p.lat * Math.PI) / 180) * R] as const);
  let a = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
export const m2ToAcres = (m2: number) => Math.round((m2 / 4046.8564224) * 100) / 100;
export const m2ToHectares = (m2: number) => Math.round((m2 / 10000) * 100) / 100;

export const metresToKm = (m: number) => Math.round(m / 100) / 10; // one decimal
export const metresToMiles = (m: number) => Math.round(m / 160.9344) / 10; // one decimal
/** Distance in the business's unit (km or miles), one decimal. */
export const metresToUnit = (m: number, unit: 'km' | 'mi') => (unit === 'mi' ? metresToMiles(m) : metresToKm(m));
