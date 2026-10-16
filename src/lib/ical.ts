import { clockParts, listTimezones, localZone, normalizeZone, wallTimeInstant } from "./timezones";
import { normalizeLink } from "./links";
import { dayKey } from "./meetings";
import { UNSUPPORTED_RULE, occurrenceDates, type Rule } from "./recurrence";

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

const MAX_EVENTS = 400;
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

/* ---------- recurrence ---------- */

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

interface Block {
  uid: string;
  title: string;
  link: string | null;
  start: WallTime;
  rule: Rule | null;
  excluded: Set<number>;
  /** Set when this block overrides one instance of a series (RECURRENCE-ID). */
  overrides: number | null;
}

function readBlock(map: Map<string, Property[]>, fallbackZone: string): Block | null {
  const startProperty = firstProperty(map, "DTSTART");
  const start = startProperty ? parseWallTime(startProperty, fallbackZone) : null;
  if (!start) return null;
  if (Number.isNaN(wallTimeInstant(start.date, start.time, start.timeZone).getTime())) return null;

  const title = textValue(map, "SUMMARY") || "Busy";
  const ruleProperty = firstProperty(map, "RRULE");
  const recurrenceProperty = firstProperty(map, "RECURRENCE-ID");
  const recurrence = recurrenceProperty ? parseWallTime(recurrenceProperty, start.timeZone) : null;

  return {
    uid: textValue(map, "UID") || `${title}:${start.date}`,
    title,
    link: linkFrom(map),
    start,
    rule: ruleProperty ? parseRule(ruleProperty.value, start.timeZone) : null,
    excluded: parseExdates(map, fallbackZone),
    overrides: recurrence
      ? wallTimeInstant(recurrence.date, recurrence.time, recurrence.timeZone).getTime()
      : null,
  };
}

function eventFrom(block: Block, date: string, instant: Date): ExternalEvent {
  const wall = block.start.allDay ? null : clockParts(block.start.timeZone, instant, false);
  return {
    uid: block.uid,
    title: block.title,
    date,
    time: block.start.allDay
      ? "00:00"
      : `${wall?.hour ?? block.start.time.slice(0, 2)}:${wall?.minute ?? block.start.time.slice(3)}`,
    timeZone: block.start.timeZone,
    allDay: block.start.allDay,
    link: block.link,
    instant,
  };
}

export function parseIcal(source: string, windowStart: Date, windowEnd: Date): ParseResult {
  const fallbackZone = localZone();
  const events: ExternalEvent[] = [];
  let unexpandedSeries = 0;

  // pass 1: read every VEVENT, so overrides can be found before any series is expanded
  const blocks: Block[] = [];
  let pending: string[] | null = null;
  for (const line of unfold(source)) {
    const marker = line.trim().toUpperCase();
    if (marker === "BEGIN:VEVENT") {
      pending = [];
      continue;
    }
    if (marker !== "END:VEVENT") {
      if (pending) pending.push(line);
      continue;
    }
    if (pending) {
      const block = readBlock(propertyMap(pending), fallbackZone);
      if (block) blocks.push(block);
    }
    pending = null;
  }

  // an edited instance must not also appear at its original slot
  const overridden = new Map<string, Set<number>>();
  for (const block of blocks) {
    if (block.overrides === null) continue;
    const set = overridden.get(block.uid);
    if (set) set.add(block.overrides);
    else overridden.set(block.uid, new Set([block.overrides]));
  }

  const inWindow = (instant: Date) =>
    instant.getTime() >= windowStart.getTime() && instant.getTime() <= windowEnd.getTime();
  const seen = new Set<string>();
  const push = (block: Block, date: string, instant: Date) => {
    const key = `${block.uid}:${instant.getTime()}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(eventFrom(block, date, instant));
  };

  for (const block of blocks) {
    if (events.length >= MAX_EVENTS) break;

    if (block.overrides !== null) {
      // the edited instance stands on its own
      const instant = wallTimeInstant(block.start.date, block.start.time, block.start.timeZone);
      if (!Number.isNaN(instant.getTime()) && inWindow(instant)) push(block, block.start.date, instant);
      continue;
    }

    if (block.rule && !block.rule.supported) {
      unexpandedSeries++;
      continue;
    }

    const excluded = new Set(block.excluded);
    for (const instant of overridden.get(block.uid) ?? []) excluded.add(instant);

    if (block.rule) {
      for (const date of occurrenceDates(block.start, block.rule, excluded, windowStart, windowEnd)) {
        const instant = wallTimeInstant(date, block.start.time, block.start.timeZone);
        if (!Number.isNaN(instant.getTime())) push(block, date, instant);
      }
      continue;
    }

    const instant = wallTimeInstant(block.start.date, block.start.time, block.start.timeZone);
    if (Number.isNaN(instant.getTime())) continue;
    if (block.excluded.has(instant.getTime()) || !inWindow(instant)) continue;
    push(block, block.start.date, instant);
  }

  events.sort((a, b) => a.instant.getTime() - b.instant.getTime());
  return { events, unexpandedSeries };
}
