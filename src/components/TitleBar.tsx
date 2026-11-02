import type { ThemeMode } from "../lib/storage";
import type { ResolvedTheme } from "../hooks/useTheme";
import { themeLabel } from "../hooks/useTheme";
import { CalendarIcon, CloseIcon, CompactIcon, InfoIcon, MonitorIcon, MoonIcon, PinIcon, SunIcon } from "./icons";

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") return <SunIcon size={15} />;
  if (mode === "dark") return <MoonIcon size={15} />;
  return <MonitorIcon />;
}

interface TitleBarProps {
  pinned: boolean;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  infoActive: boolean;
  calendarActive: boolean;
  updateAvailable: boolean;
  onTogglePin: () => void;
  onCompact: () => void;
  onCycleTheme: () => void;
  onInfo: () => void;
  onCalendar: () => void;
  onClose: () => void;
}

export function TitleBar({
  pinned,
  themeMode,
  resolvedTheme,
  infoActive,
  calendarActive,
  updateAvailable,
  onTogglePin,
  onCompact,
  onCycleTheme,
  onInfo,
  onCalendar,
  onClose,
}: TitleBarProps) {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <span className="titlebar__label" data-tauri-drag-region>
        Meridian
      </span>
      <div className="titlebar__actions">
        <button
          type="button"
          className={`icon-btn${calendarActive ? " icon-btn--active" : ""}`}
          onClick={onCalendar}
          title="Calendar and meetings"
          aria-pressed={calendarActive}
          data-tour="calendar"
        >
          <CalendarIcon />
        </button>
        <button
          type="button"
          className={`icon-btn${infoActive ? " icon-btn--active" : ""}${updateAvailable ? " icon-btn--badge" : ""}`}
          onClick={onInfo}
          title={updateAvailable ? "Developer info — update available" : "Developer info"}
          aria-pressed={infoActive}
          data-tour="info"
        >
          <InfoIcon />
        </button>
        <button
          type="button"
          className={`icon-btn${themeMode !== "system" ? " icon-btn--active" : ""}`}
          onClick={onCycleTheme}
          title={themeLabel(themeMode, resolvedTheme)}
          data-tour="theme"
        >
          <ThemeIcon mode={themeMode} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onCompact}
          title="Compact mode — time only"
          data-tour="compact"
        >
          <CompactIcon />
        </button>
        <button
          type="button"
          className={`icon-btn${pinned ? " icon-btn--active" : ""}`}
          onClick={onTogglePin}
          title={pinned ? "Unpin from top" : "Keep on top of other windows"}
          aria-pressed={pinned}
          data-tour="pin"
        >
          <PinIcon />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          onClick={onClose}
          title="Close"
          data-tour="close"
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}
