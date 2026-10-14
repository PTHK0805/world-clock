import { clockParts, listTimezones, localZone, normalizeZone } from "./timezones";
import { normalizeLink } from "./links";
import { dayKey, wallTimeInstant } from "./meetings";

export interface ExternalEvent {
  uid: string;
  title: string;
  /** Wall date/time in `timeZone`. */
  date: string;
  time: string;
  timeZone: string;
  allDay: boolean;
  link: string | null;
  instant: Date;
}

export interface ParseResult {
  events: ExternalEvent[];
  /** Repeating series whose rule is too complex to project — counted, not shown. */
  unexpandedSeries: number;
}

const DAY_MS = 86_400_000;
const MAX_EVENTS = 400;
const MAX_ITERATIONS = 1500;
const WEEKDAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const ORDINAL_DAY = /^[+-]?\d/;

/* ---------- lexing ---------- */

/** RFC 5545 folds long lines: a leading space or tab continues the previous line. */
function unfold(source: string): string[] {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): Property | null {
  let inQuotes = false;
  let colon = -1;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ":" && !inQuotes) {
      colon = index;
      break;
    }
  }
  if (colon === -1) return null;

  const head = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const chunk of head.slice(1)) {
    const equals = chunk.indexOf("=");
    if (equals === -1) continue;
    params[chunk.slice(0, equals).toUpperCase()] = chunk
      .slice(equals + 1)
      .replace(/^"|"$/g, "");
  }
  return { name: head[0].toUpperCase(), params, value: line.slice(colon + 1) };
}

function propertyMap(block: string[]): Map<string, Property[]> {
  const map = new Map<string, Property[]>();
  for (const line of block) {
    const property = parseLine(line);
    if (!property) continue;
    const existing = map.get(property.name);
    if (existing) existing.push(property);
    else map.set(property.name, [property]);
  }
  return map;
}

const firstProperty = (map: Map<string, Property[]>, name: string) => map.get(name)?.[0];

function textValue(map: Map<string, Property[]>, name: string): string {
  const property = firstProperty(map, name);
  return property ? unescapeText(property.value).trim() : "";
}

/* ---------- dates ---------- */

let cachedZones: Set<string> | null = null;

function supportedZones(): Set<string> {
  if (!cachedZones) cachedZones = new Set(listTimezones());
  return cachedZones;
}

function resolveZone(tzid: string | undefined, fallback: string): string {
  if (!tzid) return fallback;
  const normalized = normalizeZone(tzid);
  return supportedZones().has(normalized) ? normalized : "UTC";
}

interface WallTime {
  date: string;
  time: string;
  timeZone: string;
  allDay: boolean;
}

function parseWallTime(property: Property, fallbackZone: string): WallTime | null {
  const raw = property.value.trim();

  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (property.params.VALUE === "DATE" || dateOnly) {
    if (!dateOnly) return null;
    return {
      date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`,
      time: "00:00",
      timeZone: fallbackZone,
      allDay: true,
    };
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(raw);
  if (!match) return null;
  const [, year, month, day, hour, minute, , utc] = match;
  const date = `${year}-${month}-${day}`;
  const time = `${hour}:${minute}`;

  if (utc) {
    // an absolute stamp: show it on the viewer's own clock
    const instant = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
    );
    const zone = localZone();
    const parts = clockParts(zone, instant, false);
    return {
      date: dayKey(instant, zone),
      time: `${parts.hour}:${parts.minute}`,
      timeZone: zone,
      allDay: false,
    };
  }

  return { date, time, timeZone: resolveZone(property.params.TZID, fallbackZone), allDay: false };
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month - 1, day];
}

function dayNumber(date: string): number {
  const [year, month, day] = dateParts(date);
  return Math.round(Date.UTC(year, month, day) / DAY_MS);
}

function fromDayNumber(value: number): string {
  const date = new Date(value * DAY_MS);
  return ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function shiftDays(date: string, days: number): string {
  return fromDayNumber(dayNumber(date) + days);
}

function weekdayOf(date: string): number {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

/* ---------- recurrence ---------- */

interface Rule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  byDay: number[];
  byMonthDay: number[];
  count: number | null;
  until: Date | null;
  supported: boolean;
}

const UNSUPPORTED_RULE: Rule = {
  freq: "DAILY",
  interval: 1,
  byDay: [],
  byMonthDay: [],
  count: null,
  until: null,
  supported: false,
};

function parseRule(value: string, startZone: string): Rule {
  const parts = new Map<string, string>();
  for (const chunk of value.split(";")) {
    const equals = chunk.indexOf("=");
    if (equals !== -1) parts.set(chunk.slice(0, equals).toUpperCase(), chunk.slice(equals + 1).trim());
  }

  const freq = (parts.get("FREQ") ?? "").toUpperCase();
  const dayTokens = (parts.get("BYDAY") ?? "")
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
  const ordinalDays = dayTokens.some((token) => ORDINAL_DAY.test(token));
  const byDay = dayTokens
    .filter((token) => !ORDINAL_DAY.test(token))
    .map((token) => WEEKDAY_INDEX[token.slice(-2)])
    .filter((index): index is number => index !== undefined);
  const byMonthDay = (parts.get("BYMONTHDAY") ?? "")
    .split(",")
    .map((token) => Number(token.trim()))
    .filter((day) => Number.isInteger(day) && day > 0);

  const untilRaw = parts.get("UNTIL");
  const untilMatch = untilRaw
    ? /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/.exec(untilRaw)
    : null;
  const until = untilMatch
    ? untilMatch[4]
      ? new Date(
          Date.UTC(
            Number(untilMatch[1]),
            Number(untilMatch[2]) - 1,
            Number(untilMatch[3]),
            Number(untilMatch[4]),
            Number(untilMatch[5]),
          ),
        )
      : wallTimeInstant(`${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}`, "23:59", startZone)
    : null;

  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") {
    return { ...UNSUPPORTED_RULE, until };
  }

  let supported = false;
  if (freq === "DAILY") supported = dayTokens.length === 0;
  else if (freq === "WEEKLY") supported = !ordinalDays;
  else supported = !ordinalDays && !parts.has("BYSETPOS") && (byMonthDay.length > 0 || dayTokens.length === 0);

  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? "1") || 1);
  const countRaw = parts.get("COUNT");
  const count = countRaw && Number.isInteger(Number(countRaw)) ? Number(countRaw) : null;

  return { freq, interval, byDay, byMonthDay, count, until, supported };
}

/**
 * The wall dates this series lands on inside the window. Recurrence is stepped on the
 * calendar rather than by milliseconds, so a weekly 09:00 survives a DST change, and each
 * phase is fast-forwarded arithmetically so a series that began years ago still resolves
 * immediately.
 */
function occurrenceDates(
  start: WallTime,
  rule: Rule,
  excluded: Set<number>,
  windowStart: Date,
  windowEnd: Date,
): string[] {
  const instantOf = (date: string) => wallTimeInstant(date, start.time, start.timeZone);
  const windowStartDay = dayNumber(dayKey(windowStart, start.timeZone));
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
      if (dates.length >= MAX_EVENTS) break;
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
        if (dates.length >= MAX_EVENTS) break;
      }
      const probe = instantOf(shiftDays(weekStart, weekStride));
      if (probe.getTime() > windowEnd.getTime()) break;
    }
    return dates;
  }

  const [startYear, startMonth, startDayOfMonth] = dateParts(start.date);
  const monthDays = rule.byMonthDay.length > 0 ? [...rule.byMonthDay].sort((a, b) => a - b) : [startDayOfMonth];
  const absoluteMonth = (step: number) => startYear * 12 + startMonth + step * rule.interval;
  const windowMonth = (() => {
    const key = dayKey(windowStart, start.timeZone);
    const [year, month] = dateParts(key);
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
      if (dates.length >= MAX_EVENTS) break;
    }
    const probe = instantOf(ymd(Math.floor(absoluteMonth(step + 1) / 12), absoluteMonth(step + 1) % 12, 1));
    if (probe.getTime() > windowEnd.getTime()) break;
  }
  return dates;
}

/* ---------- entry point ---------- */

function linkFrom(map: Map<string, Property[]>): string | null {
  for (const name of ["X-GOOGLE-CONFERENCE", "URL", "LOCATION", "DESCRIPTION"]) {
    const value = textValue(map, name);
    if (!value) continue;
    const match = /https?:\/\/[^\s<>"')]+/.exec(value);
    const link = normalizeLink(match ? match[0] : value);
    if (link) return link;
  }
  return null;
}

function parseExdates(map: Map<string, Property[]>, fallbackZone: string): Set<number> {
  const excluded = new Set<number>();
  for (const property of map.get("EXDATE") ?? []) {
    for (const chunk of property.value.split(",")) {
      const value = chunk.trim();
      if (!value) continue;
      const rebuilt = `${property.params.VALUE === "DATE" ? "DTSTART;VALUE=DATE" : "DTSTART"}${
        property.params.TZID ? `;TZID=${property.params.TZID}` : ""
      }:${value}`;
      const parsed = parseLine(rebuilt);
      const wall = parsed ? parseWallTime(parsed, fallbackZone) : null;
      if (wall) excluded.add(wallTimeInstant(wall.date, wall.time, wall.timeZone).getTime());
    }
  }
  return excluded;
}

export function parseIcal(source: string, windowStart: Date, windowEnd: Date): ParseResult {
  const fallbackZone = localZone();
  const events: ExternalEvent[] = [];
  let unexpandedSeries = 0;

  let block: string[] | null = null;
  for (const line of unfold(source)) {
    const marker = line.trim().toUpperCase();
    if (marker === "BEGIN:VEVENT") {
      block = [];
      continue;
    }
    if (marker !== "END:VEVENT") {
      if (block) block.push(line);
      continue;
    }
    if (!block) continue;
    const map = propertyMap(block);
    block = null;

    const startProperty = firstProperty(map, "DTSTART");
    const start = startProperty ? parseWallTime(startProperty, fallbackZone) : null;
    if (!start) continue;

    const ruleProperty = firstProperty(map, "RRULE");
    const rule = ruleProperty ? parseRule(ruleProperty.value, start.timeZone) : null;
    const excluded = parseExdates(map, fallbackZone);
    const title = textValue(map, "SUMMARY") || "Busy";
    const link = linkFrom(map);
    const uid = textValue(map, "UID") || `${title}:${start.date}`;

    if (rule && !rule.supported) {
      unexpandedSeries++;
      continue;
    }

    const dates = rule
      ? occurrenceDates(start, rule, excluded, windowStart, windowEnd)
      : [start.date];

    for (const date of dates) {
      const instant = wallTimeInstant(date, start.time, start.timeZone);
      if (Number.isNaN(instant.getTime())) continue;
      if (!rule) {
        if (excluded.has(instant.getTime())) continue;
        if (instant.getTime() < windowStart.getTime() || instant.getTime() > windowEnd.getTime()) continue;
      }
      const wall = start.allDay ? null : clockParts(start.timeZone, instant, false);
      events.push({
        uid,
        title,
        date,
        time: start.allDay ? "00:00" : `${wall?.hour ?? start.time.slice(0, 2)}:${wall?.minute ?? start.time.slice(3)}`,
        timeZone: start.timeZone,
        allDay: start.allDay,
        link,
        instant,
      });
      if (events.length >= MAX_EVENTS) break;
    }
    if (events.length >= MAX_EVENTS) break;
  }

  events.sort((a, b) => a.instant.getTime() - b.instant.getTime());
  return { events, unexpandedSeries };
}
