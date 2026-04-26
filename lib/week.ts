/**
 * Week boundary helpers. Sunday → Saturday (mirrors the SQL helper
 * `current_week_start()` so the kid UI agrees with `child_current_balance()`).
 *
 * We use UTC-day arithmetic to keep things deterministic across servers and
 * client time zones.
 */

export function startOfWeekUTC(today: Date = new Date()): Date {
  const d = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const dow = d.getUTCDay(); // Sunday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sunday-anchored array of YYYY-MM-DD for the current week. */
export function weekDates(today: Date = new Date()): string[] {
  const start = startOfWeekUTC(today);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return isoDate(d);
  });
}

export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
