import { clockParts, listTimezones, localZone, normalizeZone, offsetLabel } from "./timezones";

export interface Meeting {
  id: string;
  title: string;
  /** Calendar date in the meeting's own timezone, `YYYY-MM-DD`. */
  date: string;
  /** Wall-clock time in the meeting's own timezone, 24h `HH:MM`. */
  time: string;
  timeZone: string;
  /** Minutes before the meeting to remind, or null for no reminder. */
  leadMinutes: number | null;
  /** Whether the reminder card plays a chime. */
  sound: boolean;
}

export interface PendingReminder {
  id: string;
  fireAtMs: number;
  title: string;
  body: string;
  sound: boolean;
}

export const LEAD_OPTIONS: (number | null)[] = [null, 0, 1, 3, 5, 10, 15, 30];

const STORAGE_KEY = "world-clock:events:v1";
const MAX_TITLE_LENGTH = 60;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export function leadLabel(lead: number | null): string {
  if (lead === null) return "Off";
  if (lead === 0) return "At start";
  return `${lead}m`;
}

export function leadLongLabel(lead: number | null): string {
  if (lead === null) return "No reminder";
  if (lead === 0) return "When it starts";
  return `${lead} min before`;
}

/* ---------- storage ---------- */

function sanitize(raw: unknown): Meeting | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<Meeting>;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (typeof value.date !== "string" || !DATE_PATTERN.test(value.date)) return null;
  if (typeof value.time !== "string" || !TIME_PATTERN.test(value.time)) return null;

  const timeZone = typeof value.timeZone === "string" ? normalizeZone(value.timeZone) : localZone();
  if (!new Set(listTimezones()).has(timeZone)) return null;

  const lead =
    value.leadMinutes === null || typeof value.leadMinutes === "number"
      ? value.leadMinutes
      : null;
  const leadMinutes = LEAD_OPTIONS.includes(lead) ? lead : null;

  return {
    id: value.id,
    title: (value.title ?? "").toString().trim().slice(0, MAX_TITLE_LENGTH) || "Meeting",
    date: value.date,
    time: value.time,
    timeZone,
    leadMinutes,
    sound: value.sound !== false,
  };
}

export function loadMeetings(): Meeting[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitize).filter((meeting): meeting is Meeting => meeting !== null);
  } catch {
    return [];
  }
}

export function saveMeetings(meetings: Meeting[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  } catch {
    // storage unavailable: meetings simply won't persist
  }
}

export function newMeeting(date: string, timeZone: string, time = "09:00"): Meeting {
  return {
    id: crypto.randomUUID(),
    title: "",
    date,
    time,
    timeZone,
    leadMinutes: 5,
    sound: true,
  };
}

/* ---------- wall time -> absolute instant ---------- */

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
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
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Offset of the zone at that instant, in milliseconds (east of UTC positive). */
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = partsFormatter(timeZone).formatToParts(instant);
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
 * A second pass re-reads the offset at the resulting instant so that meetings set
 * across a DST change still land on the intended local time.
 */
export function meetingInstant(meeting: Pick<Meeting, "date" | "time" | "timeZone">): Date {
  const naive = Date.parse(`${meeting.date}T${meeting.time}:00Z`);
  if (Number.isNaN(naive)) return new Date(Number.NaN);
  const firstOffset = zoneOffsetMs(meeting.timeZone, new Date(naive));
  const candidate = naive - firstOffset;
  const secondOffset = zoneOffsetMs(meeting.timeZone, new Date(candidate));
  return new Date(secondOffset === firstOffset ? candidate : naive - secondOffset);
}

/* ---------- day helpers ---------- */

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

export function dayKey(date: Date, timeZone: string): string {
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
  const parts = formatter.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "01";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function todayKey(timeZone: string): string {
  return dayKey(new Date(), timeZone);
}

export function agendaFor(meetings: Meeting[], date: string): Meeting[] {
  return meetings
    .filter((meeting) => meeting.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function meetingDates(meetings: Meeting[]): Set<string> {
  return new Set(meetings.map((meeting) => meeting.date));
}

/* ---------- reminders ---------- */

function bodyFor(meeting: Meeting, instant: Date, hour12: boolean): string {
  const zonePart = `${meeting.time} ${offsetLabel(meeting.timeZone, instant)}`;
  if (meeting.timeZone === localZone()) return zonePart;
  const local = clockParts(localZone(), instant, hour12);
  const localPart = hour12 ? `${local.hour}:${local.minute} ${local.dayPeriod}` : `${local.hour}:${local.minute}`;
  return `${zonePart} · ${localPart} your time`;
}

/** Reminders still in the future, soonest first. Past ones are dropped so a restart never re-fires. */
export function remindersFor(meetings: Meeting[], now: Date, hour12: boolean): PendingReminder[] {
  const reminders: PendingReminder[] = [];
  for (const meeting of meetings) {
    if (meeting.leadMinutes === null) continue;
    const instant = meetingInstant(meeting);
    if (Number.isNaN(instant.getTime())) continue;
    const fireAtMs = instant.getTime() - meeting.leadMinutes * 60_000;
    if (fireAtMs <= now.getTime()) continue;
    reminders.push({
      id: `${meeting.id}:${meeting.leadMinutes}`,
      fireAtMs,
      title: meeting.title,
      body: bodyFor(meeting, instant, hour12),
      sound: meeting.sound,
    });
  }
  return reminders.sort((a, b) => a.fireAtMs - b.fireAtMs);
}
