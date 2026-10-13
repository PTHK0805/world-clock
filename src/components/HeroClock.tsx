import { cityLabel, clockParts, dateLabel, offsetLabel } from "../lib/timezones";
import { ChevronDownIcon } from "./icons";

interface HeroClockProps {
  timeZone: string;
  isLocal: boolean;
  now: Date;
  hour12: boolean;
  onPickZone: () => void;
}

export function HeroClock({ timeZone, isLocal, now, hour12, onPickZone }: HeroClockProps) {
  const parts = clockParts(timeZone, now, hour12);

  return (
    <section className="hero">
      <div className="hero__meta">
        <button
          type="button"
          className="hero__zone"
          onClick={onPickZone}
          title="Change the main clock timezone"
        >
          {cityLabel(timeZone)}
          <ChevronDownIcon />
        </button>
        {isLocal && <span className="pill pill--accent">Local</span>}
        <span className="pill">{offsetLabel(timeZone, now)}</span>
      </div>
      <div className="hero__time">
        <span className="hero__digits">
          {parts.hour}
          <span className="hero__colon">:</span>
          {parts.minute}
        </span>
        <span className="hero__seconds">{parts.second}</span>
        {parts.dayPeriod && <span className="hero__period">{parts.dayPeriod}</span>}
      </div>
      <div className="hero__date">{dateLabel(timeZone, now)}</div>
    </section>
  );
}
