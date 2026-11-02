# AGENTS.md

Windows-only Tauri 2 desktop widget: React 19 + TypeScript frontend, one Rust backend in
`src-tauri/src/lib.rs`. There is no test suite, linter, or formatter config — verify with
`npm run build` (tsc typecheck) and `cargo check`.

## Commands

- `npm run tauri dev` — full app. Starts Vite via `beforeDevCommand` on fixed port 1420 (fails if busy) and the Rust side; a plain `npm run dev` previews the UI in a browser only, where Tauri APIs silently no-op (`inTauri` guards in `src/lib/window.ts`, `reminders.ts`).
- `npm run build` — `tsc && vite build`. This is the only frontend check; TS is strict with `noUnusedLocals`/`noUnusedParameters`, so unused imports fail the build.
- `cargo check` in `src-tauri/` — Rust check. A bare `cargo build` gives a dev binary that loads `http://localhost:1420`; use `npm run tauri build` for a self-contained bundle.
- `npm run tauri build` — NSIS + MSI installers in `src-tauri/target/release/bundle/`. Local signed builds need signing env vars; see README "Releasing a new version" / "In-app updates".
- `npx tauri icon src-tauri/icons/meridian-icon.svg` — regenerate every platform icon after editing the SVG source; never hand-edit the generated PNG/ICO/ICNS files.

## Architecture

- `src/main.tsx` is the only entry: it renders `App` normally, or `NotificationCard` in the separate `notify` window when the URL has `?view=notification`. Rust creates that window (`src-tauri/src/lib.rs`) and only ever keeps one.
- Reminders are scheduled in Rust (`sync_reminders` command, 5-second tick), never with JS timers — Chromium throttles hidden webviews. `focus_main` is the other command; register new ones in `generate_handler!`.
- Every window `@tauri-apps/api/window` call needs its permission in `src-tauri/capabilities/default.json`. The `notify` window must stay in that file's `windows` list.
- Outbound HTTP is capability-restricted to `https://calendar.google.com/*` (`tauri-plugin-http`). A new external fetch needs both Rust/frontend code and an allowlist entry; the capability prevents the app becoming a general fetcher.
- Closing `main` hides it to the tray (`on_window_event`); only tray → Quit calls `app.exit(0)`. `tauri-plugin-single-instance` must stay the first registered plugin: later launches exit and focus the existing `main` window.
- The widget is frameless/transparent and sized exactly to its content via a ResizeObserver → `resizeToContent()`. Do not add a `box-shadow`: it gets clipped, and DWM draws a square frame around the rounded card. `shadow: false` in `tauri.conf.json` is intentional.
- Persisted state is localStorage under `world-clock:v1` (settings), `world-clock:events:v1` (meetings), `world-clock:google:v1` (feed cache). Dev and release webviews use different origins, so state does not carry between them. The profile lives at `%LOCALAPPDATA%\com.meridian.app`.
- `productName` is **Meridian**, identifier `com.meridian.app`, and installers are `Meridian_*`. The Cargo/npm package names and all `world-clock:*` storage keys deliberately keep the old prefix for data continuity. "World Clock" appears only in migration code and legacy storage names.
- `src-tauri/installer.nsh` is the one-time NSIS migration from `World Clock`/`com.worldclock.app`: it copies the WebView2 localStorage profile into the new app-data folder and removes the old per-user install. Keep it until all 0.6.x installs are gone. The MSI `upgradeCode` is pinned to `1f677b65-1e60-57c5-adbe-3f670e65a5b2`.
- The main window is `create: false` in `tauri.conf.json` and built manually in `setup()` after `migrate_legacy_profile()`. Keep that order: creating the window first locks the WebView2 profile and defeats the MSI/manual data migration.
- The first-run tour (`src/components/Onboarding.tsx`) finds controls by `data-tour` attributes and records completion under `world-clock:tour:v1`; add that attribute when adding a tour target. It is skipped in compact mode and can be replayed from About.

## Gotchas

- Autostart is enabled on every launch unless `autostart-optout` exists in the app config dir. Testing a dev binary can repoint the `HKCU\...\Run\Meridian` entry at the dev exe; back up that value and create the marker before launching test builds. The 0.7.0 migration removes the legacy `World Clock` Run value.
- The NSIS migration only removes an old NSIS install. An old MSI install upgrades through the pinned MSI upgrade code; installing the setup exe over an MSI install is not migrated and needs a manual uninstall first.
- Timezone math uses `Intl` only (no date library); DST conversions intentionally use a two-pass approach in `src/lib/meetings.ts`. Chromium reports legacy CLDR ids (`Asia/Rangoon`, `Asia/Calcutta`) that `src/lib/timezones.ts` normalizes.
- README is detailed and current — update it when changing user-visible behavior, especially the Calendar/Google/Notes sections.

## Releasing

1. Bump `version` in `package.json` (single source of truth; `tauri.conf.json` reads it) and `src-tauri/Cargo.toml`; run `cargo check` so `Cargo.lock` follows.
2. Commit, then `git tag vX.Y.Z` and `git push origin main vX.Y.Z`. The tag push triggers `.github/workflows/release.yml`, which builds, signs, publishes the installers and `latest.json` for the in-app updater.
3. Never regenerate or replace the updater public key in `tauri.conf.json` and the matching repo secrets — existing installs could never update again.
