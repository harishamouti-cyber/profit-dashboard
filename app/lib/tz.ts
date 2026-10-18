import { formatInTimeZone } from "date-fns-tz";

/** Shop-local calendar day for a UTC instant. Stored as @db.Date. */
export function localDate(utcDate: Date | string, ianaTimezone: string): string {
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  return formatInTimeZone(date, ianaTimezone, "yyyy-MM-dd");
}

export function todayInZone(ianaTimezone: string, now = new Date()): string {
  return formatInTimeZone(now, ianaTimezone, "yyyy-MM-dd");
}

export function toDbDate(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00.000Z`);
}

export function fromDbDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive calendar-day distance. Same day returns 0. */
export function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const a = Date.UTC(sy, sm - 1, sd);
  const b = Date.UTC(ey, em - 1, ed);
  return Math.round((b - a) / 86_400_000);
}

/** Days in the month of an ISO day. Independent of the server timezone. */
export function daysInMonth(isoDay: string): number {
  const [year, month] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function daysInYear(isoDay: string): number {
  const year = Number(isoDay.slice(0, 4));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 366 : 365;
}

export function startOfMonth(isoDay: string): string {
  return `${isoDay.slice(0, 7)}-01`;
}

export function endOfMonth(isoDay: string): string {
  const start = startOfMonth(isoDay);
  const dim = daysInMonth(start);
  return `${isoDay.slice(0, 7)}-${String(dim).padStart(2, "0")}`;
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "mtd" | "last_month";

export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const day = addDays(today, -1);
    return { from: day, to: day };
  }
  if (preset === "7d") return { from: addDays(today, -6), to: today };
  if (preset === "30d") return { from: addDays(today, -29), to: today };
  if (preset === "mtd") return { from: startOfMonth(today), to: today };
  const last = addDays(startOfMonth(today), -1);
  return { from: startOfMonth(last), to: endOfMonth(last) };
}

export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const length = daysBetween(from, to) + 1;
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -(length - 1)), to: prevTo };
}
