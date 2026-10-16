export interface ClockParts {
  hour: string;
  minute: string;
  second: string;
  dayPeriod: string;
}

export const POPULAR_ZONES = [
  "Asia/Yangon",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

const FALLBACK_ZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Anchorage",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dhaka",
  "Asia/Dubai",
  "Asia/Ho_Chi_Minh",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Jerusalem",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Kolkata",
  "Asia/Kuala_Lumpur",
  "Asia/Manila",
  "Asia/Riyadh",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tehran",
  "Asia/Tokyo",
  "Asia/Yangon",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Zurich",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

// Chromium/V8 resolve zone ids to the older CLDR primary names (Asia/Rangoon,
// Asia/Calcutta, Europe/Kiev...), so map them back to the current IANA names.
const MODERN_NAMES: Record<string, string> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Atka": "America/Adak",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Knox_IN": "America/Indiana/Knox",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Ashkhabad": "Asia/Ashgabat",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Dacca": "Asia/Dhaka",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Macao": "Asia/Macau",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Thimbu": "Asia/Thimphu",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

// Intl omits UTC and the Etc/* family entirely, so they are added by hand.
const EXTRA_ZONES = ["UTC"];

const ETC_ALIASES: Record<string, string> = {
  "Etc/GMT": "UTC",
  "Etc/UTC": "UTC",
  "Etc/Universal": "UTC",
  "Etc/Zulu": "UTC",
};

export function normalizeZone(zone: string): string {
  return ETC_ALIASES[zone] ?? MODERN_NAMES[zone] ?? zone;
}

const ALIAS_KEYWORDS = new Map<string, string[]>();
for (const [legacy, modern] of Object.entries(MODERN_NAMES)) {
  if (legacy === modern) continue;
  const keywords = ALIAS_KEYWORDS.get(modern) ?? [];
  keywords.push(cityLabel(legacy));
  ALIAS_KEYWORDS.set(modern, keywords);
}

let cachedZones: string[] | null = null;

export function listTimezones(): string[] {
  if (cachedZones) return cachedZones;
  let raw: string[] = [];
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf === "function") {
    try {
      raw = intl.supportedValuesOf("timeZone");
    } catch {
      raw = [];
    }
  }
  if (raw.length === 0) raw = FALLBACK_ZONES;
  const zones = new Set<string>(EXTRA_ZONES);
  for (const zone of raw) zones.add(normalizeZone(zone));
  cachedZones = [...zones].sort((a, b) => a.localeCompare(b));
  return cachedZones;
}

export function localZone(): string {
  try {
    return normalizeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  } catch {
    return "UTC";
  }
}

export function cityLabel(timeZone: string): string {
  const segment = timeZone.split("/").pop() ?? timeZone;
  return segment.replace(/_/g, " ");
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

export function offsetLabel(timeZone: string, at: Date): string {
  try {
    let formatter = offsetFormatters.get(timeZone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" });
      offsetFormatters.set(timeZone, formatter);
    }
    const name = formatter.formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? "";
    if (!name || name === "GMT" || name === "UTC") return "GMT+0";
    return name;
  } catch {
    return "";
  }
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function clockFormatter(timeZone: string, hour12: boolean): Intl.DateTimeFormat {
  const key = `${timeZone}|${hour12 ? "12" : "24"}`;
  let formatter = clockFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(hour12 ? "en-US" : "en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: hour12 ? "h12" : "h23",
    });
    clockFormatters.set(key, formatter);
  }
  return formatter;
}

export function clockParts(timeZone: string, at: Date, hour12: boolean): ClockParts {
  const parts = clockFormatter(timeZone, hour12).formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
    dayPeriod: pick("dayPeriod"),
  };
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dayNumber(timeZone: string, at: Date): number {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(pick("year"), pick("month") - 1, pick("day"));
}

export function dayDelta(timeZone: string, at: Date, referenceZone: string = localZone()): number {
  if (timeZone === referenceZone) return 0;
  return Math.round((dayNumber(timeZone, at) - dayNumber(referenceZone, at)) / 86_400_000);
}

const longDateFormatters = new Map<string, Intl.DateTimeFormat>();

export function dateLabel(timeZone: string, at: Date): string {
  let formatter = longDateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, { timeZone, weekday: "long", month: "long", day: "numeric" });
    longDateFormatters.set(timeZone, formatter);
  }
  return formatter.format(at);
}

export function isNight(timeZone: string, at: Date): boolean {
  const hour = Number(clockParts(timeZone, at, false).hour);
  return hour < 6 || hour >= 19;
}

let searchIndex: { zone: string; haystack: string }[] | null = null;

function getSearchIndex(): { zone: string; haystack: string }[] {
  if (!searchIndex) {
    searchIndex = listTimezones().map((zone) => ({
      zone,
      haystack: [cityLabel(zone), zone, ...(ALIAS_KEYWORDS.get(zone) ?? [])].join(" ").toLowerCase().replace(/_/g, " "),
    }));
  }
  return searchIndex;
}

export function searchZones(query: string, limit = 60): string[] {
  const needle = query.trim().toLowerCase().replace(/_/g, " ");
  if (!needle) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const { zone, haystack } of getSearchIndex()) {
    if (haystack.startsWith(needle)) starts.push(zone);
    else if (haystack.includes(needle)) contains.push(zone);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/* ---------- wall clock -> absolute instant ---------- */

const wallFormatters = new Map<string, Intl.DateTimeFormat>();

function wallFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = wallFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    wallFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Offset of the zone at that instant, in milliseconds (east of UTC positive). */
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = wallFormatter(timeZone).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    pick("hour"),
    pick("minute"),
    pick("second"),
  );
  const wholeSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - wholeSeconds;
}

/**
 * Turns a wall-clock date/time in a specific timezone into an absolute instant.
 * A second pass re-reads the offset at the resulting instant so that times set
 * across a DST change still land on the intended local time.
 */
export function wallTimeInstant(date: string, time: string, timeZone: string): Date {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) return new Date(Number.NaN);
  const firstOffset = zoneOffsetMs(timeZone, new Date(naive));
  const candidate = naive - firstOffset;
  const secondOffset = zoneOffsetMs(timeZone, new Date(candidate));
  return new Date(secondOffset === firstOffset ? candidate : naive - secondOffset);
}
