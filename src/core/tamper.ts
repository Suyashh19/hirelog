/**
 * Clock-tamper check (TP-2). Device uptime (ms since boot) cannot be changed by the user, wall-clock can.
 * If the two disagree by more than the tolerance between Start and Stop, the entry is flagged.
 * A reboot between start and stop resets uptime (end < start); we cannot compare then, so we do not flag.
 */
export function isClockTampered(
  a: { wallStartMs: number; wallEndMs: number; uptimeStartMs: number | null; uptimeEndMs: number | null },
  toleranceMs = 120_000,
): boolean {
  if (a.uptimeStartMs === null || a.uptimeEndMs === null) return false;
  if (a.uptimeEndMs < a.uptimeStartMs) return false;
  const wall = a.wallEndMs - a.wallStartMs;
  const up = a.uptimeEndMs - a.uptimeStartMs;
  return Math.abs(wall - up) > toleranceMs;
}
