/**
 * Timezone-aware date helpers. Every "today" / "this week" computation
 * across the app routes through these — server actions, page loaders,
 * and the SQL helpers in 20260426000001_household_timezone.sql all
 * agree because they share the same anchor (the household's IANA
 * timezone).
 *
 * Functions that operate on YYYY-MM-DD strings are pure timezone-
 * independent date arithmetic; the only place a timezone enters the
 * picture is `localDateInTz`, which is how you turn an instant into a
 * day in the user's frame of reference.
 */

export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** What we fall back to if the household has no timezone configured. */
export const FALLBACK_TIMEZONE = "America/Denver";

/**
 * Returns YYYY-MM-DD for "now" (or the given instant) as observed in
 * the named IANA timezone. Uses the en-CA locale because it formats
 * naturally as YYYY-MM-DD; the locale doesn't affect the underlying
 * date arithmetic.
 */
export function localDateInTz(tz: string, instant: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(instant);
}

/** Given a YYYY-MM-DD date, returns the YYYY-MM-DD of the preceding (or same) Sunday. */
export function startOfWeekIso(localDateIso: string): string {
  const [y, m, d] = localDateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}

/** Sunday-anchored array of seven YYYY-MM-DD dates starting at the given week-start. */
export function weekDatesFrom(weekStartIso: string): string[] {
  const [y, m, d] = weekStartIso.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    return dt.toISOString().slice(0, 10);
  });
}

/** Validates an IANA timezone name by trying to construct a formatter. */
export function isValidTimezone(tz: string): boolean {
  try {
    // Throws RangeError on invalid IANA names.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
