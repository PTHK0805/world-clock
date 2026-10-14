export interface MeetingProvider {
  id: string;
  name: string;
  color: string;
  /** Video-call platforms get a camera glyph; anything else gets a link glyph. */
  video: boolean;
}

const PROVIDERS: { domains: string[]; provider: MeetingProvider }[] = [
  { domains: ["meet.google.com"], provider: { id: "meet", name: "Google Meet", color: "#00897b", video: true } },
  { domains: ["zoom.us"], provider: { id: "zoom", name: "Zoom", color: "#2d8cff", video: true } },
  { domains: ["teams.microsoft.com", "teams.live.com"], provider: { id: "teams", name: "Teams", color: "#6264a7", video: true } },
  { domains: ["webex.com"], provider: { id: "webex", name: "Webex", color: "#0b5cff", video: true } },
  { domains: ["discord.gg", "discord.com"], provider: { id: "discord", name: "Discord", color: "#5865f2", video: true } },
  { domains: ["whereby.com"], provider: { id: "whereby", name: "Whereby", color: "#4e4bf3", video: true } },
  { domains: ["jit.si"], provider: { id: "jitsi", name: "Jitsi", color: "#1c6bf3", video: true } },
  { domains: ["skype.com"], provider: { id: "skype", name: "Skype", color: "#00aff0", video: true } },
  { domains: ["bluejeans.com"], provider: { id: "bluejeans", name: "BlueJeans", color: "#1d7de0", video: true } },
  { domains: ["gather.town", "gather.app"], provider: { id: "gather", name: "Gather", color: "#3a5a8c", video: false } },
];

const FALLBACK_PROVIDER: MeetingProvider = { id: "link", name: "Meeting link", color: "#6b7280", video: false };

/**
 * Accepts a bare host (`meet.google.com/abc`) or a full URL, and returns a usable
 * URL. Anything that is not http(s) is rejected so a pasted `javascript:` or
 * `file:` link can never reach the shell opener.
 */
export function normalizeLink(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function providerFor(link: string | null | undefined): MeetingProvider | null {
  const normalized = normalizeLink(link);
  if (!normalized) return null;
  let host: string;
  try {
    host = new URL(normalized).hostname.toLowerCase();
  } catch {
    return FALLBACK_PROVIDER;
  }
  for (const entry of PROVIDERS) {
    if (entry.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return entry.provider;
    }
  }
  return FALLBACK_PROVIDER;
}

/** The short host, for showing what a link points at. */
export function linkHost(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}
