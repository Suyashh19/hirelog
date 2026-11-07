export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

/** "9:00" "9" "9.30" "9:00pm" "1430" -> minutes since midnight, or null. */
export function parseClock(input: string): number | null {
  const t = input.trim().toLowerCase().replace(/\s+/g, '');
  const m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/) ?? t.match(/^(\d{2})(\d{2})()$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const suffix = m[3] || '';
  if (min > 59 || h > 24) return null;
  if (suffix === 'pm' && h < 12) h += 12;
  if (suffix === 'am' && h === 12) h = 0;
  if (h > 23) return null;
  return h * 60 + min;
}

/**
 * "9:00 to 13:30" / "9am-1:30pm" -> minutes between (end <= start means overnight, +24h).
 * "4.5 hrs" / "4.5" / "90 min" / "2h 30m" -> minutes. Returns null when unparseable.
 */
export function parseDurationOrRange(input: string): { minutes: number; from?: number; to?: number } | null {
  const t = input.trim().toLowerCase();
  if (!t) return null;
  const range = t.match(/^(.+?)\s*(?:to|-|–)\s*(.+)$/);
  if (range) {
    let a = range[1];
    const b = range[2];
    // "9-1:30pm": inherit the end's am/pm only if it makes the range positive
    const from = parseClock(a);
    const to = parseClock(b);
    if (from === null || to === null) return null;
    let diff = to - from;
    if (diff <= 0) diff += 24 * 60;
    return { minutes: diff, from, to };
  }
  const hm = t.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?)?\s*(?:(\d+)\s*m(?:in(?:s|utes)?)?)?$/);
  if (hm && (hm[1] || hm[2])) {
    return { minutes: Math.round(parseFloat(hm[1] ?? '0') * 60 + parseInt(hm[2] ?? '0', 10)) };
  }
  const plain = t.match(/^(\d+(?:\.\d+)?)$/);
  if (plain) return { minutes: Math.round(parseFloat(plain[1]) * 60) };
  return null;
}
