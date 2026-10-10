/**
 * Timezone helpers shared by server and browser code.
 * Deliberately free of node-only imports so client components can use
 * them (lib/attendance/core.ts must never be imported on the client).
 * Everything is stored in UTC and displayed in the gym's timezone.
 */
export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date (YYYY-MM-DD) in the given timezone. */
export function localDateIn(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function formatInTimezone(
  iso: string | Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions
): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-IN", { timeZone: timezone, ...options }).format(date);
}
