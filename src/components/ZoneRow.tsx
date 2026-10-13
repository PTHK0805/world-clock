import { cityLabel, clockParts, dayDelta, isNight, offsetLabel } from "../lib/timezones";
import { CloseIcon, MoonIcon, SunIcon } from "./icons";

interface ZoneRowProps {
  timeZone: string;
  referenceZone: string;
  now: Date;
  hour12: boolean;
  onRemove: (timeZone: string) => void;
}

export function ZoneRow({ timeZone, referenceZone, now, hour12, onRemove }: ZoneRowProps) {
  const parts = clockParts(timeZone, now, hour12);
  const delta = dayDelta(timeZone, now, referenceZone);
  const night = isNight(timeZone, now);
  const city = cityLabel(timeZone);

  return (
    <div className="zone">
      <div className="zone__info">
        <span className="zone__city">{city}</span>
        <span className="zone__offset">{offsetLabel(timeZone, now)}</span>
      </div>
      <span className="zone__icon" title={night ? "Night" : "Day"}>
        {night ? <MoonIcon /> : <SunIcon />}
      </span>
      <span className="zone__time">
        {parts.hour}:{parts.minute}
        {parts.dayPeriod && <em className="zone__period">{parts.dayPeriod}</em>}
        {delta !== 0 && (
          <span className={`zone__delta${delta > 0 ? " zone__delta--plus" : ""}`}>{delta > 0 ? "+1" : "−1"}</span>
        )}
      </span>
      <button
        type="button"
        className="icon-btn icon-btn--tiny zone__remove"
        onClick={() => onRemove(timeZone)}
        title={`Remove ${city}`}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
