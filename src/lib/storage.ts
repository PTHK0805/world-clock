import { listTimezones, normalizeZone } from "./timezones";
import { LEAD_OPTIONS } from "./meetings";

export type ThemeMode = "system" | "light" | "dark";

export interface Settings {
  zones: string[];
  primaryZone: string | null;
  hour12: boolean;
  pinned: boolean;
  compact: boolean;
  theme: ThemeMode;
  position: { x: number; y: number } | null;
  /** Secret iCal address of the subscribed Google calendar, or null. */
  calendarUrl: string | null;
  /** Reminder lead applied to imported events; null means none. */
  calendarLeadMinutes: number | null;
}

const STORAGE_KEY = "world-clock:v1";

const DEFAULT_SETTINGS: Settings = {
  zones: [],
  primaryZone: null,
  hour12: false,
  pinned: true,
  compact: false,
  theme: "system",
  position: null,
  calendarUrl: null,
  calendarLeadMinutes: 5,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const supported = new Set(listTimezones());
    const primaryRaw = typeof parsed.primaryZone === "string" ? normalizeZone(parsed.primaryZone) : null;
    const primaryZone = primaryRaw && supported.has(primaryRaw) ? primaryRaw : null;
    const zones = Array.isArray(parsed.zones)
      ? parsed.zones
          .filter((zone): zone is string => typeof zone === "string")
          .map(normalizeZone)
          .filter((zone) => supported.has(zone) && zone !== primaryZone)
      : [];
    const position =
      parsed.position && typeof parsed.position.x === "number" && typeof parsed.position.y === "number"
        ? { x: parsed.position.x, y: parsed.position.y }
        : null;
    const theme: ThemeMode =
      parsed.theme === "light" || parsed.theme === "dark" ? parsed.theme : "system";
    const calendarUrl =
      typeof parsed.calendarUrl === "string" && parsed.calendarUrl.trim() !== ""
        ? parsed.calendarUrl.trim()
        : null;
    const lead = parsed.calendarLeadMinutes;
    const calendarLeadMinutes =
      lead === null || (typeof lead === "number" && LEAD_OPTIONS.includes(lead)) ? lead : 5;
    return {
      zones: [...new Set(zones)],
      primaryZone,
      hour12: parsed.hour12 === true,
      pinned: parsed.pinned !== false,
      compact: parsed.compact === true,
      theme,
      position,
      calendarUrl,
      calendarLeadMinutes,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable: settings simply won't persist
  }
}
