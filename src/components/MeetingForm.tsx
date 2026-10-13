import { useMemo, useState } from "react";
import { cityLabel, localZone, offsetLabel, searchZones } from "../lib/timezones";
import { LEAD_OPTIONS, leadLongLabel, leadLabel, meetingInstant, type Meeting } from "../lib/meetings";
import { BellIcon, ChevronLeftIcon, TrashIcon } from "./icons";

interface MeetingFormProps {
  draft: Meeting;
  mode: "new" | "edit";
  zones: string[];
  heroZone: string;
  hour12: boolean;
  onSave: (meeting: Meeting) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}

const QUICK_ZONE_LIMIT = 5;

export function MeetingForm({
  draft,
  mode,
  zones,
  heroZone,
  hour12,
  onSave,
  onCancel,
  onDelete,
}: MeetingFormProps) {
  const [title, setTitle] = useState(draft.title);
  const [date, setDate] = useState(draft.date);
  const [time, setTime] = useState(draft.time);
  const [timeZone, setTimeZone] = useState(draft.timeZone);
  const [leadMinutes, setLeadMinutes] = useState<number | null>(draft.leadMinutes);
  const [zoneSearch, setZoneSearch] = useState("");
  const [pickingZone, setPickingZone] = useState(false);
  const [error, setError] = useState("");

  const local = localZone();
  const isEditing = mode === "edit";

  const quickZones = useMemo(() => {
    const candidates = [heroZone, local, ...zones].filter(Boolean);
    return [...new Set(candidates)].slice(0, QUICK_ZONE_LIMIT);
  }, [heroZone, local, zones]);

  const searchResults = useMemo(() => {
    const query = zoneSearch.trim();
    if (!query) return [];
    return searchZones(query, 40).slice(0, 8);
  }, [zoneSearch]);

  const instant = meetingInstant({ date, time, timeZone });
  const localPreview =
    timeZone === local
      ? null
      : (() => {
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: local,
            hourCycle: hour12 ? "h12" : "h23",
            hour: "2-digit",
            minute: "2-digit",
          }).formatToParts(instant);
          const pick = (type: Intl.DateTimeFormatPartTypes) =>
            parts.find((part) => part.type === type)?.value ?? "";
          const period = pick("dayPeriod");
          return `${pick("hour")}:${pick("minute")}${period ? ` ${period}` : ""}`;
        })();

  const save = () => {
    if (!date || !time) {
      setError("Pick a date and a time");
      return;
    }
    if (Number.isNaN(instant.getTime())) {
      setError("That date and time could not be read");
      return;
    }
    onSave({
      ...draft,
      title: title.trim().slice(0, 60) || "Meeting",
      date,
      time,
      timeZone,
      leadMinutes,
    });
  };

  return (
    <div className="form">
      <div className="form__header">
        <button type="button" className="icon-btn icon-btn--tiny" onClick={onCancel} title="Back to calendar">
          <ChevronLeftIcon />
        </button>
        <span className="panel-hint">{isEditing ? "Edit meeting" : "New meeting"}</span>
        {isEditing ? (
          <button
            type="button"
            className="icon-btn icon-btn--tiny icon-btn--danger"
            onClick={() => onDelete(draft.id)}
            title="Delete meeting"
          >
            <TrashIcon />
          </button>
        ) : (
          <span className="icon-btn icon-btn--tiny" aria-hidden="true" />
        )}
      </div>

      <input
        className="form__input form__input--title"
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
        placeholder="Meeting title"
        maxLength={60}
        autoFocus
      />

      <div className="form__row">
        <input
          className="form__input"
          type="date"
          value={date}
          onChange={(event) => setDate(event.currentTarget.value)}
        />
        <input
          className="form__input"
          type="time"
          value={time}
          onChange={(event) => setTime(event.currentTarget.value)}
        />
      </div>

      <div className="form__zone">
        {pickingZone ? (
          <>
            <input
              className="form__input"
              value={zoneSearch}
              onChange={(event) => setZoneSearch(event.currentTarget.value)}
              placeholder="Search a city or timezone"
              autoFocus
            />
            <div className="form__zones">
              {(searchResults.length > 0 ? searchResults : quickZones).map((zone) => (
                <button
                  key={zone}
                  type="button"
                  className={`form__zone-item${zone === timeZone ? " form__zone-item--active" : ""}`}
                  onClick={() => {
                    setTimeZone(zone);
                    setPickingZone(false);
                    setZoneSearch("");
                  }}
                >
                  <span className="form__zone-city">{cityLabel(zone)}</span>
                  <span className="form__zone-offset">{offsetLabel(zone, instant)}</span>
                </button>
              ))}
              {zoneSearch.trim() !== "" && searchResults.length === 0 && (
                <p className="form__hint">No timezone matches that.</p>
              )}
            </div>
          </>
        ) : (
          <button type="button" className="form__zone-current" onClick={() => setPickingZone(true)}>
            <span className="form__zone-city">{cityLabel(timeZone)}</span>
            <span className="form__zone-offset">{offsetLabel(timeZone, instant)}</span>
            {localPreview && <span className="form__zone-local">your {localPreview}</span>}
          </button>
        )}
      </div>

      <div className="form__reminder">
        <span className="form__label">
          <BellIcon /> {leadLongLabel(leadMinutes)}
        </span>
        <div className="form__chips">
          {LEAD_OPTIONS.map((option) => (
            <button
              key={String(option)}
              type="button"
              className={`form__chip${option === leadMinutes ? " form__chip--active" : ""}`}
              onClick={() => setLeadMinutes(option)}
            >
              {leadLabel(option)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="form__error">{error}</p>}

      <button type="button" className="form__save" onClick={save}>
        {isEditing ? "Save changes" : "Add meeting"}
      </button>
    </div>
  );
}
