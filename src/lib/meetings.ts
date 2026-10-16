import { clockParts, listTimezones, localZone, normalizeZone, offsetLabel, wallTimeInstant } from "./timezones";
import { normalizeLink } from "./links";
import { occurrenceDates, type Rule, type WallTime } from "./recurrence";

export interface RecurrenceRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  /** Every N days/weeks/months. */
  interval: number;
  /** Weekly only: 0 = Sunday. */
  byDay: number[];
  /** Inclusive last date, `YYYY-MM-DD`, or null for no end. */
  until: string | null;
  /** Individual dates removed from the series, `YYYY-MM-DD`. */
  skippedDates: string[];
}

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
  /** Video-call URL for the meeting, or null. */
  link: string | null;
  /** Where the meeting came from; imported events are read-only in the UI. */
  source: "local" | "google";
  /** All-day entries from a feed, shown without a time and without a reminder. */
  allDay: boolean;
  /** Set when the meeting repeats; the stored entry is the series. */
  recurrence: RecurrenceRule | null;
  /** For a generated occurrence, the id of the series it came from. */
  seriesId: string | null;
}

export interface PendingReminder {
  id: string;
  fireAtMs: number;
  title: string;
  body: string;
  sound: boolean;
  link: string | null;
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
    link: normalizeLink(value.link),
    source: value.source === "google" ? "google" : "local",
    allDay: value.allDay === true,
    recurrence: sanitizeRule(value.recurrence),
    seriesId: typeof value.seriesId === "string" && value.seriesId !== "" ? value.seriesId : null,
  };
}

function sanitizeRule(raw: unknown): RecurrenceRule | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<RecurrenceRule>;
  if (value.freq !== "DAILY" && value.freq !== "WEEKLY" && value.freq !== "MONTHLY") return null;
  const days = Array.isArray(value.byDay) ? value.byDay : [];
  return {
    freq: value.freq,
    interval: Math.min(99, Math.max(1, Math.round(Number(value.interval) || 1))),
    byDay:
      value.freq === "WEEKLY"
        ? [...new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
        : [],
    until: typeof value.until === "string" && DATE_PATTERN.test(value.until) ? value.until : null,
    skippedDates: Array.isArray(value.skippedDates)
      ? [...new Set(value.skippedDates.filter((date): date is string => typeof date === "string" && DATE_PATTERN.test(date)))]
      : [],
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

export function newMeeting(date: string, timeZone: string, time?: string): Meeting {
  return {
    id: crypto.randomUUID(),
    title: "",
    date,
    time: time ?? currentWallTime(timeZone),
    timeZone,
    leadMinutes: 5,
    sound: true,
    link: null,
    source: "local",
    allDay: false,
    recurrence: null,
    seriesId: null,
  };
}

/** Now, as 24h `HH:MM` on the wall clock of the given zone. */
function currentWallTime(timeZone: string): string {
  const parts = clockParts(timeZone, new Date(), false);
  return `${parts.hour}:${parts.minute}`;
}

/* ---------- wall time -> absolute instant ---------- */

export function meetingInstant(meeting: Pick<Meeting, "date" | "time" | "timeZone">): Date {
  return wallTimeInstant(meeting.date, meeting.time, meeting.timeZone);
}

/* ---------- recurrence ---------- */

/** Bridges a stored rule to the expander's shape; null when the meeting doesn't repeat. */
function ruleFromMeeting(meeting: Meeting): Rule | null {
  const recurrence = meeting.recurrence;
  if (!recurrence) return null;
  return {
    freq: recurrence.freq,
    interval: Math.max(1, recurrence.interval),
    byDay: recurrence.freq === "WEEKLY" ? recurrence.byDay : [],
    byMonthDay: [],
    count: null,
    // the end date is inclusive, so compare against the last minute of that local day
    until: recurrence.until ? wallTimeInstant(recurrence.until, "23:59", meeting.timeZone) : null,
    supported: true,
  };
}

/**
 * Expands repeating meetings into individual occurrences inside the window. Meetings that
 * don't repeat pass through untouched, so a caller can hand over a whole list. Occurrences
 * carry a `seriesId` back to the stored series and clear `recurrence`, so an already
 * expanded list can never be expanded a second time.
 */
export function expandMeetings(meetings: Meeting[], from: Date, to: Date): Meeting[] {
  const expanded: Meeting[] = [];
  for (const meeting of meetings) {
    const rule = ruleFromMeeting(meeting);
    if (!rule) {
      expanded.push(meeting);
      continue;
    }
    const start: WallTime = { date: meeting.date, time: meeting.time, timeZone: meeting.timeZone };
    const skipped = new Set(
      (meeting.recurrence?.skippedDates ?? []).map((date) =>
        wallTimeInstant(date, meeting.time, meeting.timeZone).getTime(),
      ),
    );
    for (const date of occurrenceDates(start, rule, skipped, from, to)) {
      const instant = wallTimeInstant(date, meeting.time, meeting.timeZone);
      if (Number.isNaN(instant.getTime())) continue;
      expanded.push({
        ...meeting,
        id: `${meeting.id}@${instant.getTime()}`,
        date,
        seriesId: meeting.id,
        recurrence: null,
      });
    }
  }
  return expanded;
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
      link: meeting.link,
    });
  }
  return reminders.sort((a, b) => a.fireAtMs - b.fireAtMs);
}
