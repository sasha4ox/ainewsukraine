import { DateTime } from "luxon";

export function nowInZone(timezone: string): DateTime {
  return DateTime.now().setZone(timezone);
}

export function digestWindow(timezone: string, at = DateTime.now()): { start: Date; end: Date; digestDate: Date } {
  const end = at.setZone(timezone);
  const start = end.minus({ hours: 24 });
  return {
    start: start.toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
    digestDate: DateTime.utc(end.year, end.month, end.day).toJSDate(),
  };
}

export function calendarDateInZone(timezone: string, at = DateTime.now()): Date {
  const local = at.setZone(timezone);
  return DateTime.utc(local.year, local.month, local.day).toJSDate();
}

/** Minutes until DIGEST_TIME in that zone. Negative means the target is already past. */
export function minutesUntilDigest(timezone: string, digestTime: string, at = DateTime.now()): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(digestTime.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const now = at.setZone(timezone);
  const target = now.set({ hour, minute, second: 0, millisecond: 0 });
  return Math.round(target.diff(now, "minutes").minutes);
}

/** Scheduled runs may publish at or after DIGEST_TIME. A runner that woke much too early must wait. */
export function isScheduledDigestDue(
  timezone: string,
  digestTime: string,
  at = DateTime.now(),
  eventName = process.env.GITHUB_EVENT_NAME,
): boolean {
  if (eventName !== "schedule") return true;
  const early = minutesUntilDigest(timezone, digestTime, at);
  if (early === null) return true;
  return early <= 25;
}
