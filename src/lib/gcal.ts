import { fetch } from "@tauri-apps/plugin-http";
import { parseIcal, type ExternalEvent } from "./ical";
import type { Meeting } from "./meetings";

export interface FeedCache {
  fetchedAt: number;
  events: ExternalEvent[];
  unexpandedSeries: number;
}

export type FetchOutcome =
  | { ok: true; cache: FeedCache }
  | { ok: false; reason: "bad-url" | "not-ical" | "network" | "empty" };

const CACHE_KEY = "world-clock:google:v1";
const WINDOW_DAYS = 30;

/** Only Google's own iCal host is ever fetched — the capability allows nothing else. */
export function isGoogleCalendarUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" && parsed.hostname === "calendar.google.com";
  } catch {
    return false;
  }
}

export function loadFeedCache(): FeedCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedCache;
    if (!Array.isArray(parsed.events) || typeof parsed.fetchedAt !== "number") return null;
    return {
      fetchedAt: parsed.fetchedAt,
      unexpandedSeries: parsed.unexpandedSeries ?? 0,
      events: parsed.events
        .filter((event) => event && typeof event.uid === "string" && typeof event.date === "string")
        .map((event) => ({ ...event, instant: new Date(event.instant) }))
        .filter((event) => !Number.isNaN(event.instant.getTime())),
    };
  } catch {
    return null;
  }
}

function saveFeedCache(cache: FeedCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable: the feed just won't be cached
  }
}

export function clearFeedCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

/** Fetches through Rust, because Google's iCal host sends no CORS headers. */
export async function fetchFeed(url: string): Promise<FetchOutcome> {
  const trimmed = url.trim();
  if (!isGoogleCalendarUrl(trimmed)) return { ok: false, reason: "bad-url" };

  let body: string;
  try {
    const response = await fetch(trimmed, { method: "GET" });
    if (!response.ok) {
      return { ok: false, reason: response.status === 404 || response.status === 410 ? "bad-url" : "network" };
    }
    body = await response.text();
  } catch {
    return { ok: false, reason: "network" };
  }

  if (!/BEGIN:VCALENDAR/i.test(body)) return { ok: false, reason: "not-ical" };

  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + WINDOW_DAYS * 86_400_000);
  const { events, unexpandedSeries } = parseIcal(body, windowStart, windowEnd);
  if (events.length === 0 && unexpandedSeries === 0) return { ok: false, reason: "empty" };

  const cache: FeedCache = { fetchedAt: Date.now(), events, unexpandedSeries };
  saveFeedCache(cache);
  return { ok: true, cache };
}

/** Projects feed events onto the meeting model so the rest of the app needs no special cases. */
export function toMeetings(cache: FeedCache, leadMinutes: number | null): Meeting[] {
  return cache.events.map((event) => ({
    id: `gcal:${event.uid}:${event.instant.getTime()}`,
    title: event.title,
    date: event.date,
    time: event.time,
    timeZone: event.timeZone,
    leadMinutes: event.allDay ? null : leadMinutes,
    sound: true,
    link: event.link,
    source: "google" as const,
    allDay: event.allDay,
    // imported feeds arrive already expanded, so they carry no rule of their own
    recurrence: null,
    seriesId: null,
  }));
}
