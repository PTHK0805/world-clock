import { useCallback, useEffect, useRef, useState } from "react";
import { AboutView } from "./components/AboutView";
import { CompactClock } from "./components/CompactClock";
import { Footer } from "./components/Footer";
import { HeroClock } from "./components/HeroClock";
import { TitleBar } from "./components/TitleBar";
import { ZoneList } from "./components/ZoneList";
import { ZonePickerPanel } from "./components/ZonePickerPanel";
import { useNow } from "./hooks/useNow";
import { useSettings } from "./hooks/useSettings";
import { useResolvedTheme, nextThemeMode } from "./hooks/useTheme";
import { useUpdater } from "./hooks/useUpdater";
import { saveSettings } from "./lib/storage";
import { localZone } from "./lib/timezones";
import { closeWidget, currentPosition, moveTo, resizeToContent, setPinned } from "./lib/window";

type PickerMode = "list" | "primary" | "about";

function App() {
  const now = useNow();
  const { settings, update } = useSettings();
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const resolvedTheme = useResolvedTheme(settings.theme);
  const updater = useUpdater();

  const localTimeZone = localZone();
  const heroZone = settings.primaryZone ?? localTimeZone;
  const heroIsLocal = heroZone === localTimeZone;

  useEffect(() => {
    void setPinned(settings.pinned);
  }, [settings.pinned]);

  useEffect(() => {
    // restore once on mount; later moves are picked up by the position poll below
    const position = settings.position;
    if (position) void moveTo(position.x, position.y);
  }, []);

  useEffect(() => {
    // The window move event only fires when a drag starts, so poll for the settled position.
    let last = settings.position;
    const timer = window.setInterval(async () => {
      const position = await currentPosition();
      if (!position) return;
      if (last && last.x === position.x && last.y === position.y) return;
      last = position;
      update({ position });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [update]);

  useEffect(() => {
    // Keep the window sized to the widget, which is a small pill in compact mode.
    const node = widgetRef.current;
    if (!node) return;
    let frame = 0;
    let lastWidth = 0;
    let lastHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const width = Math.ceil(box ? box.inlineSize : entry.contentRect.width);
      const height = Math.ceil(box ? box.blockSize : entry.contentRect.height);
      if (Math.abs(width - lastWidth) < 2 && Math.abs(height - lastHeight) < 2) return;
      lastWidth = width;
      lastHeight = height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void resizeToContent(width, height));
    });
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const addZone = useCallback(
    (zone: string) => {
      update({ zones: settings.zones.includes(zone) ? settings.zones : [...settings.zones, zone] });
    },
    [settings.zones, update],
  );

  const removeZone = useCallback(
    (zone: string) => {
      update({ zones: settings.zones.filter((existing) => existing !== zone) });
    },
    [settings.zones, update],
  );

  const choosePrimaryZone = useCallback(
    (zone: string | null) => {
      // null (and picking the machine's own zone) means "keep following the system timezone"
      const primaryZone = zone === null || zone === localTimeZone ? null : zone;
      update({
        primaryZone,
        zones: primaryZone ? settings.zones.filter((existing) => existing !== primaryZone) : settings.zones,
      });
      setPicker(null);
    },
    [localTimeZone, settings.zones, update],
  );

  const toggleCompact = useCallback(
    (compact: boolean) => {
      setPicker(null);
      update({ compact });
    },
    [update],
  );

  const handleClose = useCallback(async () => {
    // persist the exact position synchronously, before the webview goes away
    const position = await currentPosition();
    saveSettings({ ...settings, position: position ?? settings.position });
    await closeWidget();
  }, [settings]);

  return (
    <div
      className={`widget${settings.compact ? " widget--compact" : ""}`}
      data-theme={resolvedTheme}
      ref={widgetRef}
    >
      {settings.compact ? (
        <CompactClock
          timeZone={heroZone}
          now={now}
          hour12={settings.hour12}
          onExpand={() => toggleCompact(false)}
        />
      ) : (
        <>
          <TitleBar
            pinned={settings.pinned}
            themeMode={settings.theme}
            resolvedTheme={resolvedTheme}
            infoActive={picker === "about"}
            onTogglePin={() => update({ pinned: !settings.pinned })}
            onCompact={() => toggleCompact(true)}
            onCycleTheme={() => update({ theme: nextThemeMode(settings.theme) })}
            onInfo={() => setPicker((mode) => (mode === "about" ? null : "about"))}
            onClose={() => void handleClose()}
          />
          {picker === "about" ? (
            <AboutView onClose={() => setPicker(null)} updater={updater} />
          ) : (
            <>
              <div className="widget__body">
                <HeroClock
                  timeZone={heroZone}
                  isLocal={heroIsLocal}
                  now={now}
                  hour12={settings.hour12}
                  onPickZone={() => setPicker((mode) => (mode === "primary" ? null : "primary"))}
                />
                {picker === "primary" ? (
                  <ZonePickerPanel
                    hint="Main clock"
                    now={now}
                    currentZone={heroZone}
                    allowLocal
                    localSelected={heroIsLocal}
                    localTimeZone={localTimeZone}
                    onSelect={choosePrimaryZone}
                    onClose={() => setPicker(null)}
                  />
                ) : picker === "list" ? (
                  <ZonePickerPanel
                    hint="Add a city to your list"
                    now={now}
                    disabled={[heroZone, ...settings.zones]}
                    localTimeZone={localTimeZone}
                    onSelect={(zone) => {
                      if (zone) addZone(zone);
                    }}
                    onClose={() => setPicker(null)}
                  />
                ) : (
                  <ZoneList
                    zones={settings.zones}
                    referenceZone={heroZone}
                    now={now}
                    hour12={settings.hour12}
                    onRemove={removeZone}
                  />
                )}
              </div>
              <Footer
                hour12={settings.hour12}
                onToggleHour12={() => update({ hour12: !settings.hour12 })}
                pickerOpen={picker === "list"}
                onTogglePicker={() => setPicker((mode) => (mode === "list" ? null : "list"))}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
