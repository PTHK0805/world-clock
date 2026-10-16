import { wallTimeInstant } from "./timezones";

const DAY_MS = 86_400_000;
const MAX_ITERATIONS = 1500;
const MAX_OCCURRENCES = 400;

/** A wall-clock moment in a zone — what the expander works in. */
export interface WallTime {
  date: string;
  time: string;
  timeZone: string;
}

export interface Rule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  /** 0 = Sunday. Used by WEEKLY. */
  byDay: number[];
  /** Used by MONTHLY when present, otherwise the start date's day is used. */
  byMonthDay: number[];
  count: number | null;
  until: Date | null;
  /** False for patterns that cannot be projected (e.g. "the second Tuesday"). */
  supported: boolean;
}

export const UNSUPPORTED_RULE: Rule = {
  freq: "DAILY",
  interval: 1,
  byDay: [],
  byMonthDay: [],
  count: null,
  until: null,
  supported: false,
};

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month - 1, day];
}

export function dayNumber(date: string): number {
  const [year, month, day] = dateParts(date);
  return Math.round(Date.UTC(year, month, day) / DAY_MS);
}

export function fromDayNumber(value: number): string {
  const date = new Date(value * DAY_MS);
  return ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function shiftDays(date: string, days: number): string {
  return fromDayNumber(dayNumber(date) + days);
}

export function weekdayOf(date: string): number {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

/**
 * The wall dates a series lands on inside the window. Recurrence is stepped on the calendar
 * rather than by milliseconds, so a weekly 09:00 survives a DST change, and each phase is
 * fast-forwarded arithmetically so a series that began years ago still resolves immediately.
 */
export function occurrenceDates(
  start: WallTime,
  rule: Rule,
  excluded: Set<number>,
  windowStart: Date,
  windowEnd: Date,
): string[] {
  const instantOf = (date: string) => wallTimeInstant(date, start.time, start.timeZone);
  const windowStartDay = dayNumber(dayKeyIn(windowStart, start.timeZone));
  const dates: string[] = [];
  const take = (date: string) => {
    const instant = instantOf(date);
    if (Number.isNaN(instant.getTime())) return;
    if (excluded.has(instant.getTime())) return;
    if (instant.getTime() < windowStart.getTime() || instant.getTime() > windowEnd.getTime()) return;
    dates.push(date);
  };

  const startDay = dayNumber(start.date);

  if (rule.freq === "DAILY") {
    let index = Math.max(0, Math.floor((windowStartDay - startDay) / rule.interval));
    if (rule.count !== null) index = Math.min(index, rule.count);
    let produced = index;
    for (let step = 0; step < MAX_ITERATIONS; step++, index++) {
      if (rule.count !== null && produced >= rule.count) break;
      const date = shiftDays(start.date, index * rule.interval);
      const instant = instantOf(date);
      if (rule.until && instant.getTime() > rule.until.getTime()) break;
      take(date);
      produced++;
      if (instant.getTime() > windowEnd.getTime()) break;
      if (dates.length >= MAX_OCCURRENCES) break;
    }
    return dates;
  }

  if (rule.freq === "WEEKLY") {
    const days = rule.byDay.length > 0 ? [...rule.byDay].sort((a, b) => a - b) : [weekdayOf(start.date)];
    const firstWeek = shiftDays(start.date, -((weekdayOf(start.date) + 6) % 7));
    const weekStride = 7 * rule.interval;
    let week = Math.max(0, Math.floor((windowStartDay - dayNumber(firstWeek)) / weekStride));
    if (rule.count !== null) week = Math.min(week, Math.floor(rule.count / Math.max(1, days.length)));
    let produced = week * days.length;

    for (let step = 0; step < MAX_ITERATIONS; step++, week++) {
      if (rule.count !== null && produced >= rule.count) break;
      const weekStart = shiftDays(firstWeek, week * weekStride);
      for (const day of days) {
        if (rule.count !== null && produced >= rule.count) break;
        const date = shiftDays(weekStart, (day + 6) % 7);
        if (date < start.date) continue;
        const instant = instantOf(date);
        if (rule.until && instant.getTime() > rule.until.getTime()) break;
        take(date);
        produced++;
        if (dates.length >= MAX_OCCURRENCES) break;
      }
      const probe = instantOf(shiftDays(weekStart, weekStride));
      if (probe.getTime() > windowEnd.getTime()) break;
    }
    return dates;
  }

  const [startYear, startMonth, startDayOfMonth] = dateParts(start.date);
  const monthDays =
    rule.byMonthDay.length > 0 ? [...rule.byMonthDay].sort((a, b) => a - b) : [startDayOfMonth];
  const absoluteMonth = (step: number) => startYear * 12 + startMonth + step * rule.interval;
  const windowMonth = (() => {
    const [year, month] = dateParts(dayKeyIn(windowStart, start.timeZone));
    return year * 12 + month;
  })();
  let step = Math.max(0, Math.floor((windowMonth - (startYear * 12 + startMonth)) / rule.interval));
  if (rule.count !== null) step = Math.min(step, Math.floor(rule.count / Math.max(1, monthDays.length)));
  let produced = step * monthDays.length;

  for (let pass = 0; pass < MAX_ITERATIONS; pass++, step++) {
    if (rule.count !== null && produced >= rule.count) break;
    const monthIndex = absoluteMonth(step);
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    for (const monthDay of monthDays) {
      if (rule.count !== null && produced >= rule.count) break;
      const candidate = new Date(Date.UTC(year, month, monthDay));
      if (candidate.getUTCMonth() !== month) continue; // e.g. the 31st of a 30-day month
      const date = ymd(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate());
      if (date < start.date) continue;
      const instant = instantOf(date);
      if (rule.until && instant.getTime() > rule.until.getTime()) break;
      take(date);
      produced++;
      if (dates.length >= MAX_OCCURRENCES) break;
    }
    const probe = instantOf(ymd(Math.floor(absoluteMonth(step + 1) / 12), absoluteMonth(step + 1) % 12, 1));
    if (probe.getTime() > windowEnd.getTime()) break;
  }
  return dates;
}

/* ---------- zone-aware calendar day ---------- */

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date an instant falls on, in a zone. */
export function dayKeyIn(instant: Date, timeZone: string): string {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "01";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
