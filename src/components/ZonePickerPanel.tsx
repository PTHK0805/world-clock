import { useEffect, useMemo, useRef, useState } from "react";
import { POPULAR_ZONES, cityLabel, offsetLabel, searchZones } from "../lib/timezones";
import { CheckIcon, CloseIcon, GlobeIcon, SearchIcon } from "./icons";

const LOCAL_KEYWORDS = ["local", "home", "system", "windows"];

interface ZonePickerPanelProps {
  hint: string;
  now: Date;
  disabled?: string[];
  currentZone?: string;
  allowLocal?: boolean;
  localSelected?: boolean;
  localTimeZone: string;
  onSelect: (timeZone: string | null) => void;
  onClose: () => void;
}

export function ZonePickerPanel({
  hint,
  now,
  disabled = [],
  currentZone,
  allowLocal = false,
  localSelected = false,
  localTimeZone,
  onSelect,
  onClose,
}: ZonePickerPanelProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const disabledSet = useMemo(() => new Set(disabled), [disabled]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return POPULAR_ZONES.filter((zone) => !disabledSet.has(zone));
    return searchZones(trimmed);
  }, [query, disabledSet]);

  const trimmedQuery = query.trim().toLowerCase();
  const showLocal = allowLocal && (trimmedQuery === "" || LOCAL_KEYWORDS.some((word) => word.startsWith(trimmedQuery)));

  const renderZone = (zone: string, isCurrent: boolean) => {
    const isDisabled = disabledSet.has(zone);
    return (
      <button
        key={zone}
        type="button"
        className={`picker__item${isDisabled ? " picker__item--added" : ""}${isCurrent ? " picker__item--current" : ""}`}
        disabled={isDisabled}
        onClick={() => onSelect(zone)}
      >
        <span className="picker__city">
          {isCurrent && (
            <span className="picker__check">
              <CheckIcon />
            </span>
          )}
          {cityLabel(zone)}
        </span>
        <span className="picker__zone">{zone}</span>
        <span className="picker__offset">{offsetLabel(zone, now)}</span>
      </button>
    );
  };

  const nothingToShow =
    !showLocal &&
    results.length === 0 &&
    (trimmedQuery !== "" || POPULAR_ZONES.every((zone) => disabledSet.has(zone)));

  return (
    <div
      className="picker"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <p className="panel-hint">{hint}</p>
      <div className="picker__search">
        <SearchIcon />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const first = results.find((zone) => !disabledSet.has(zone));
            if (first) onSelect(first);
          }}
          placeholder="Search a city or timezone"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="button" className="icon-btn icon-btn--tiny" onClick={onClose} title="Close">
          <CloseIcon size={12} />
        </button>
      </div>
      <div className="picker__list">
        {showLocal && (
          <button
            type="button"
            className={`picker__item${localSelected ? " picker__item--current" : ""}`}
            onClick={() => onSelect(null)}
          >
            <span className="picker__city">
              {localSelected && (
                <span className="picker__check">
                  <CheckIcon />
                </span>
              )}
              <span className="picker__globe">
                <GlobeIcon />
              </span>
              Local time
            </span>
            <span className="picker__zone">follows your Windows timezone</span>
            <span className="picker__offset">{offsetLabel(localTimeZone, now)}</span>
          </button>
        )}
        {results.map((zone) => renderZone(zone, zone === currentZone))}
        {nothingToShow && (
          <p className="picker__empty">
            {trimmedQuery ? `No timezone matches "${query.trim()}".` : "Every suggested city is already shown."}
          </p>
        )}
      </div>
    </div>
  );
}
