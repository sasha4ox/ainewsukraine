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

/** Scheduled runs publish only near DIGEST_TIME. Manual and local runs always proceed. */
export function isScheduledDigestDue(
  timezone: string,
  digestTime: string,
  at = DateTime.now(),
  eventName = process.env.GITHUB_EVENT_NAME,
): boolean {
  if (eventName !== "schedule") return true;
  const match = /^(\d{1,2}):(\d{2})$/.exec(digestTime.trim());
  if (!match) return true;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return true;
  const now = at.setZone(timezone);
  const target = now.set({ hour, minute, second: 0, millisecond: 0 });
  const delta = now.diff(target, "minutes").minutes;
  return delta >= -20 && delta <= 50;
}
