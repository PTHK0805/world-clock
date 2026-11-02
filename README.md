# Meridian

A lightweight always-on-top desktop clock widget for Windows: a frameless draggable card showing local time plus any number of extra timezones.

Built with Tauri 2 + React + TypeScript. No runtime dependencies for time logic — everything uses the platform `Intl` API, so DST and offset changes come straight from the browser's IANA/ICU database.

## Features

- Large hero clock whose timezone is switchable — click the city name to make any city the main clock, or pick "Local time" to follow the Windows timezone again
- Add any IANA timezone with a searchable picker (city name, zone id, or legacy spelling); press Enter to take the top match
- Per-zone offset pill (`GMT+6:30`), sun/moon indicator, and `+1`/`−1` day badge relative to the main clock
- No duplicate cities: the main clock's zone is hidden from the list picker, and choosing a listed city as the main clock moves it out of the list
- Frameless, draggable window that resizes itself to fit its content
- Compact mode: a small pill showing only the time (click the titlebar icon to switch). Click the pill to expand it again, drag it to move it
- Light, dark, and follow-Windows themes — the titlebar theme button cycles system → light → dark
- First-run spotlight tour that explains each toolbar button, the main clock, adding timezones and the format toggle — replay it from the About screen
- Developer info view (titlebar ⓘ button) that takes over the whole widget — name, website, and email links that open in the default browser or mail app
- Calendar with meetings — a month grid with dots on days that have meetings, plus the selected day's agenda
- Every meeting carries its own timezone, shown with your local equivalent (`15:00 GMT-7 · 17:00 your time`)
- Custom reminder card before a meeting — pick `Off · At start · 1m · 3m · 5m · 10m · 15m · 30m`. It's our own window, not a Windows toast, and it plays a short synthesized chime you can mute per meeting
- Reminders fire even while the widget is hidden in the tray
- Meeting links (Google Meet, Zoom, Teams, Webex, Discord and more) show the provider's real favicon, fetched from the meeting's own host, with a one-click **Join**
- Themed date and time pickers that follow the app's palette and 12/24h setting instead of the OS controls
- Repeating meetings: every day, every N days/weeks/months, or weekly on chosen weekdays, with an optional end date. Occurrences show on the right days and each gets its own reminder; editing any occurrence edits the whole series, and deleting asks whether you mean that occurrence or every one
- Subscribe to a Google Calendar iCal feed: paste the calendar's secret address and its events appear read-only alongside your own, with all-day entries, Meet links and reminders of their own
- System tray icon with a right-click menu: Show / Hide, Start with Windows, Quit — left-click toggles the widget
- No taskbar button (and no Alt+Tab entry) — the widget lives in the tray
- Starts with Windows by default; untick "Start with Windows" in the tray menu to opt out
- Closing the widget (X) hides it to the tray instead of exiting — use Quit in the tray menu to exit
- Always-on-top pin toggle, backed by the native `WS_EX_TOPMOST` window flag — pinned by default, and re-asserted whenever the widget regains focus
- Updates download themselves in the background (checked at launch and every 6 hours); a badge appears on the ⓘ button and About offers a single **Restart to update**, which hands off to the installer and brings the widget back
- Window position, timezone list, main-clock zone, compact state, theme, and 12/24h preference persist across restarts
- Rounded, transparent, themed UI (light and dark) with reduced-motion support

## Requirements

- Node 18+
- Rust (stable, MSVC toolchain) — `winget install Rustlang.Rustup`
- Visual Studio 2022 Build Tools with the C++ workload and a Windows SDK
- WebView2 runtime (preinstalled on Windows 10/11)

## Development

```bash
npm install
npm run tauri dev
```

## Build installers

```bash
npm run tauri build
```

Output lands in `src-tauri/target/release/bundle/`:
- `nsis/Meridian_<version>_x64-setup.exe` (~1.4 MB)
- `msi/Meridian_<version>_x64_en-US.msi` (~2.1 MB)

App icons are generated from `src-tauri/icons/meridian-icon.svg`:

```bash
npx tauri icon src-tauri/icons/meridian-icon.svg
```

This overwrites the PNG/ICO/ICNS files in `src-tauri/icons/`; edit the SVG, not the generated files.

## Releasing a new version

Bump `version` in `package.json` — that is the single source of truth for the app,
the installers, and the version shown in the About view (`tauri.conf.json` reads it
via `"version": "../package.json"`). Update `version` in `src-tauri/Cargo.toml` too
so the Rust crate stays in step, then rebuild.

The MSI upgrade code is pinned in `tauri.conf.json` to the value used before the
rename (`1f677b65-1e60-57c5-adbe-3f670e65a5b2`), so Windows treats a new build as
an upgrade of the same app rather than a second copy.

## Branding and identity

The app, installers and Start menu entry are **Meridian** (`productName` in
`tauri.conf.json`), with the identifier `com.meridian.app`.

Version 0.7.0 changed both from `World Clock` / `com.worldclock.app`. The migration has
two parts:

- `src-tauri/installer.nsh` runs before the NSIS install: it copies the WebView2
  localStorage profile from `%LOCALAPPDATA%\com.worldclock.app` to
  `%LOCALAPPDATA%\com.meridian.app`, preserves the autostart opt-out marker, and
  silently removes the old `World Clock` install. The old profile is left in place as a
  rollback copy.
- `src-tauri/src/lib.rs` runs the same localStorage/marker migration before creating the
  main window. This covers MSI installs and any path where the NSIS hook was skipped.

Do not change the identifier or the `world-clock:*` localStorage keys again without an
equivalent migration: the identifier owns the WebView2 data directory, so a plain rename
would hide every saved zone, meeting and setting.

## In-app updates

The app updates itself through `tauri-plugin-updater`, which verifies every update
against a minisign public key baked into the binary. Updates are served from a static
`latest.json` on GitHub Releases.

### One-time setup

1. Generate a signing keypair (the private key was created at `~/.tauri/world-clock.key`):

   ```bash
   npm run tauri signer generate -- -w ~/.tauri/world-clock.key
   ```

2. Put the **public** key into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
3. Add the **private** key as a repository secret named `TAURI_SIGNING_PRIVATE_KEY`
   (paste the file contents), and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has one.
4. Point `plugins.updater.endpoints` at your releases:
   `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`

> **Back up the private key.** If it is lost, you can never ship an update to copies
> that are already installed — those users would have to reinstall by hand.
> Regenerating the key also invalidates all existing installs, so decide on a password
> *before* the first release.

### Shipping an update

```bash
# 1. bump the version in package.json and src-tauri/Cargo.toml
# 2. commit, then tag and push
git tag v0.3.0
git push origin v0.3.0
```

`.github/workflows/release.yml` then builds, signs, creates the GitHub release with the
installer, and attaches `latest.json`. Installed apps pick it up on their next launch —
the About view shows an "Update to vX.Y.Z" row, and installing exits the app while the
installer runs (a Windows PowerShell/installer limitation, not a choice).

To build a signed release locally instead of in CI:

```powershell
# The build reads the key CONTENT from TAURI_SIGNING_PRIVATE_KEY —
# a file path only works for `tauri signer sign`, not for `tauri build`.
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content "$env:USERPROFILE\.tauri\world-clock.key" -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content "$env:USERPROFILE\.tauri\world-clock-password.txt" -Raw).Trim()
npm run tauri build
```

This produces `Meridian_<version>_x64-setup.exe` plus a matching `.sig` next to it.

### Notes

- The updater has to already be inside the installed build. The first updater-enabled
  release must be installed by hand; everything after that can self-update.
- Windows installs updates in `passive` mode, so users see a small progress window
  rather than a full installer wizard.
- The signing key must have a password. A passwordless key makes the signer hang
  waiting for a password prompt that never reaches a non-interactive shell.

## Project layout

```
src/
  components/    TitleBar, HeroClock, ZoneList, ZoneRow, ZonePickerPanel, CompactClock,
                 CalendarView, MeetingForm, NotificationCard, AboutView, Onboarding, Footer, icons
  hooks/         useNow (second-aligned tick), useSettings (persisted state),
                 useTheme (system/light/dark), useUpdater
  lib/           timezones (Intl formatting/search), meetings (model + instant maths),
                 storage (localStorage), reminders (Tauri commands), window (Tauri APIs)
src-tauri/
  src/lib.rs             tray, autostart, reminder scheduler, notification window
  tauri.conf.json        window config: frameless, transparent, always on top
  capabilities/default.json  window permissions
```

Calendar notes:
- Meetings are stored under their own `world-clock:events:v1` key so the 2-second window-position
  poll doesn't rewrite them.
- A meeting's wall time is converted to an absolute instant with `Intl` (two passes so DST
  transitions land on the intended local time) rather than pulling in a date library.
- Reminders are scheduled in Rust, not with JS timers: a hidden webview gets its timers throttled
  by Chromium, which is exactly when a reminder still has to fire.
- The reminder card lives in its own `notify` window — the same bundle, routed by
  `?view=notification` — which is why `notify` is listed in the capability's window list.

Google Calendar subscription:
- In Google Calendar: Settings → your calendar → **"Secret address in iCal format"**, then paste it
  into the Google Calendar row at the bottom of the calendar view.
- The feed is fetched through Rust (`tauri-plugin-http`), because Google's iCal host sends no CORS
  headers. The capability allows exactly one origin, `https://calendar.google.com/*`, so a bad
  address can't turn the app into a general-purpose fetcher.
- `src/lib/ical.ts` is a focused RFC 5545 reader: it unfolds lines, understands `TZID`/UTC/all-day
  stamps, pulls the conference link out of `X-GOOGLE-CONFERENCE`, and expands `DAILY`, `WEEKLY` and
  simple `MONTHLY` rules (with `INTERVAL`, `BYDAY`, `COUNT`, `UNTIL`, `EXDATE`) across a now→30 day
  window. Exotic patterns (like "second Tuesday") are counted and reported rather than guessed.
  Edited instances of a series (`RECURRENCE-ID`) replace their original slot instead of duplicating it.
- `src/lib/recurrence.ts` holds that expander, shared with repeating meetings: a local series is
  stored once with its rule and expanded at the edges — the calendar expands the visible month,
  and `App` expands a now→30 day window before deriving reminders. Occurrences carry a `seriesId`
  back to the series and clear their rule, so an expanded list can never be expanded twice.
- Imported events are mapped onto the same `Meeting` model with `source: "google"`, so the month
  grid, dots, agenda and reminder scheduler all work on them unchanged; the UI just makes them
  read-only. The feed cache lives under `world-clock:google:v1`.
- Google caches this feed, so changes can take a while to show up. Refresh happens at launch, every
  30 minutes, and on demand.

Theming: both palettes live in `src/styles/global.css` — dark is the `:root` default and light is applied via `data-theme="light"` on the widget element, so switching themes only swaps CSS variables.

## Notes

- Timezone data comes from the WebView2 runtime, so it stays current with Windows updates.
- Chromium resolves some zone ids to legacy CLDR names (`Asia/Rangoon`, `Asia/Calcutta`); `src/lib/timezones.ts` maps these back to the modern IANA names and keeps the old spellings searchable.
- Window moves are tracked by polling `outerPosition()`, because the window move event only fires when a drag begins. Minimized positions (`-32000`) are ignored so the widget can never restore off-screen.
- Compact mode has no native drag region: `mousedown` is tracked in JS so a plain click expands the pill while a real drag moves the window.
- The window deliberately has no shadow (OS or CSS). It is sized exactly to the widget, so a CSS `box-shadow` would be clipped by the window into dark square corners, and the Windows DWM shadow/frame draws a square outline around the rounded card.
- Dev and release builds have separate webview origins, so `localStorage` (and therefore saved zones/position) does not carry over between them.
- The website and email links go through `tauri-plugin-opener` with the `opener:default` permission, which allows `https://` and `mailto:` URLs. Whether a link actually opens depends on the default browser / mail app being configured in Windows.
- The tray icon and its menu are built in Rust (`src-tauri/src/lib.rs`) with Tauri's built-in tray API; autostart uses `tauri-plugin-autostart`, which writes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- Autostart is enabled on first run. Turning it off from the tray writes an `autostart-optout` marker into the app config directory so the next launch does not switch it back on.
- `skipTaskbar` is applied through the `ITaskbarList` COM API (not window styles), so the taskbar button disappears while `WS_EX_APPWINDOW` stays set — check the actual taskbar, not the ex-style, when testing.

## License

MIT © 2026 Phyo Thiha Kyaw — see [LICENSE](LICENSE).
