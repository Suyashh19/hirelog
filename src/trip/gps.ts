import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { isRunningInExpoGo } from 'expo';
import { kvGet, kvSet } from '../db/repo';
import { addFix, metresToUnit, type GeoPoint } from '../core/geo';
import { distanceUnit } from '../core/region';

/**
 * Counts the km of a trip with the phone's GPS.
 * - Expo Go: only while the app is open (Expo Go cannot run location in the background on Android).
 * - Installed app: keeps counting with the screen off, with a "Trip running" notification.
 * Progress is saved after every fix, so closing the app never loses the km already counted.
 * The counted km is a suggestion: the Stop screen shows it and the user can correct it.
 */
const TASK = 'trip-gps';
const ACTIVE_KEY = 'gps-active';
const key = (entryId: string) => `gps:${entryId}`;

interface TripState { m: number; last: GeoPoint | null; fixes: number; first?: GeoPoint | null }

function read(entryId: string): TripState {
  try {
    const raw = kvGet(key(entryId));
    return raw ? (JSON.parse(raw) as TripState) : { m: 0, last: null, fixes: 0, first: null };
  } catch {
    return { m: 0, last: null, fixes: 0, first: null };
  }
}
function addLocations(entryId: string, locs: Location.LocationObject[]) {
  let s = read(entryId);
  for (const l of locs) {
    const p: GeoPoint = { lat: l.coords.latitude, lon: l.coords.longitude, t: l.timestamp, acc: l.coords.accuracy };
    const r = addFix(s.m, s.last, p);
    const good = p.acc === null || p.acc <= 50;
    s = { m: r.totalM, last: r.last, fixes: s.fixes + 1, first: s.first ?? (good ? p : null) };
  }
  kvSet(key(entryId), JSON.stringify(s));
}

/** "Kothrud, Pune" for a point; null if offline or unknown. */
async function placeName(p: GeoPoint | null | undefined): Promise<string | null> {
  if (!p) return null;
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lon });
    if (!a) return null;
    const parts = [a.district ?? a.subregion ?? a.name, a.city ?? a.region].filter((x, i, arr) => !!x && arr.indexOf(x) === i);
    return parts.length ? parts.join(', ').slice(0, 80) : null;
  } catch {
    return null;
  }
}

// Background task (installed app only). Must be defined at the top level of a module loaded at startup.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const id = kvGet(ACTIVE_KEY);
  if (id) addLocations(id, data.locations);
});

let watch: Location.LocationSubscription | null = null;
let watchingId: string | null = null;

async function startForeground(entryId: string) {
  watch?.remove();
  watch = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
    (l) => addLocations(entryId, [l]),
  );
  watchingId = entryId;
}

export type GpsStart = { ok: true; background: boolean } | { ok: false; message: string };

/** Starts counting km for a running trip. */
export async function startGpsTrip(entryId: string): Promise<GpsStart> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      return { ok: false, message: 'Location permission was not given, so GPS cannot count the km. You can type the km when the trip ends.' };
    }
    kvSet(ACTIVE_KEY, entryId);
    kvSet(key(entryId), JSON.stringify({ m: 0, last: null, fixes: 0, first: null }));
    let background = false;
    if (!isRunningInExpoGo()) {
      try {
        const bg = await Location.requestBackgroundPermissionsAsync();
        if (bg.status === 'granted') {
          await Location.startLocationUpdatesAsync(TASK, {
            accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 10000,
            pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
            foregroundService: { notificationTitle: 'Trip running', notificationBody: 'Counting km for the bill', notificationColor: '#0F5C4D' },
          });
          background = true;
        }
      } catch {
        background = false;
      }
    }
    if (!background) await startForeground(entryId);
    return { ok: true, background };
  } catch (e: any) {
    return { ok: false, message: `GPS could not start: ${String(e?.message ?? e).slice(0, 120)}` };
  }
}

/** After the app reopens: keep counting the running trip (foreground watch). */
export async function resumeGpsTrip(runningIds: string[]) {
  const id = kvGet(ACTIVE_KEY);
  if (!id || !runningIds.includes(id) || watchingId === id) return;
  try {
    const bgOn = !isRunningInExpoGo() && (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false));
    if (bgOn) return;
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status === 'granted') await startForeground(id);
  } catch {
    // GPS is a helper; the trip still works without it
  }
}

/** Stops counting. Returns the distance counted (one decimal) and the start/end place names when known. */
export async function stopGpsTrip(entryId: string): Promise<{ km: number; from: string | null; to: string | null }> {
  if (watchingId === entryId) { watch?.remove(); watch = null; watchingId = null; }
  if (kvGet(ACTIVE_KEY) === entryId) {
    kvSet(ACTIVE_KEY, '');
    try {
      if (!isRunningInExpoGo() && (await Location.hasStartedLocationUpdatesAsync(TASK))) await Location.stopLocationUpdatesAsync(TASK);
    } catch {
      // already stopped
    }
  }
  const s = read(entryId);
  const [from, to] = await Promise.all([placeName(s.first), placeName(s.last)]);
  return { km: tripKm(entryId), from, to: to && to !== from ? to : to ?? null };
}

/** Distance counted so far for this trip, in the business's unit (km or miles). */
export const tripKm = (entryId: string) => metresToUnit(read(entryId).m, distanceUnit());
/** True while GPS is counting this trip. */
export const isGpsTrip = (entryId: string) => kvGet(ACTIVE_KEY) === entryId;
/** How many GPS fixes arrived: 0 after a while means no signal. */
export const tripFixes = (entryId: string) => read(entryId).fixes;
