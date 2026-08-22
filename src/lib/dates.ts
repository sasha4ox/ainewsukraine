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
