import { useMemo, useState } from "react";
import { cityLabel, localZone, offsetLabel, searchZones } from "../lib/timezones";
import { LEAD_OPTIONS, leadLongLabel, leadLabel, meetingInstant, todayKey, type Meeting } from "../lib/meetings";
import { normalizeLink, providerFor } from "../lib/links";
import { BellIcon, CalendarIcon, ChevronLeftIcon, ClockIcon, LinkIcon, SpeakerIcon, TrashIcon } from "./icons";
import { MonthGrid, partsFromKey, shortDateLabel } from "./MonthGrid";
import { ProviderIcon } from "./ProviderIcon";
import { TimePicker, formatTime } from "./TimePicker";

interface MeetingFormProps {
  draft: Meeting;
  mode: "new" | "edit";
  zones: string[];
  heroZone: string;
  hour12: boolean;
  marked?: Set<string>;
  onSave: (meeting: Meeting) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}

const QUICK_ZONE_LIMIT = 5;

type OpenPicker = null | "date" | "time" | "zone";

export function MeetingForm({
  draft,
  mode,
  zones,
  heroZone,
  hour12,
  marked,
  onSave,
  onCancel,
  onDelete,
}: MeetingFormProps) {
  const [title, setTitle] = useState(draft.title);
  const [date, setDate] = useState(draft.date);
  const [time, setTime] = useState(draft.time);
  const [timeZone, setTimeZone] = useState(draft.timeZone);
  const [leadMinutes, setLeadMinutes] = useState<number | null>(draft.leadMinutes);
  const [sound, setSound] = useState(draft.sound);
  const [link, setLink] = useState(draft.link ?? "");
  const [zoneSearch, setZoneSearch] = useState("");
  const [open, setOpen] = useState<OpenPicker>(null);
  const [cursor, setCursor] = useState(() => {
    const [year, month] = partsFromKey(draft.date);
    return { year, month };
  });
  const [error, setError] = useState("");

  const local = localZone();
  const today = todayKey(heroZone);
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
  const normalizedLink = normalizeLink(link);
  const linkProvider = providerFor(normalizedLink);
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

  const toggle = (next: Exclude<OpenPicker, null>) => {
    setOpen((current) => (current === next ? null : next));
  };

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
      sound,
      link: normalizedLink,
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
        <button
          type="button"
          className={`form__field${open === "date" ? " form__field--open" : ""}`}
          onClick={() => toggle("date")}
        >
          <span className="form__field-value">{shortDateLabel(date)}</span>
          <span className="form__field-icon">
            <CalendarIcon size={14} />
          </span>
        </button>
        <button
          type="button"
          className={`form__field${open === "time" ? " form__field--open" : ""}`}
          onClick={() => toggle("time")}
        >
          <span className="form__field-value">{formatTime(time, hour12)}</span>
          <span className="form__field-icon">
            <ClockIcon />
          </span>
        </button>
      </div>

      {open === "date" && (
        <MonthGrid
          year={cursor.year}
          month={cursor.month}
          selected={date}
          today={today}
          marked={marked}
          onSelect={(next) => {
            setDate(next);
            setOpen(null);
          }}
          onMonthChange={(year, month) => setCursor({ year, month })}
        />
      )}

      {open === "time" && <TimePicker value={time} hour12={hour12} onChange={setTime} />}

      <div className="form__zone">
        {open === "zone" ? (
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
                    setOpen(null);
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
          <button type="button" className="form__zone-current" onClick={() => toggle("zone")}>
            <span className="form__zone-city">{cityLabel(timeZone)}</span>
            <span className="form__zone-offset">{offsetLabel(timeZone, instant)}</span>
            {localPreview && <span className="form__zone-local">your {localPreview}</span>}
          </button>
        )}
      </div>

      <div className="form__link">
        <span className="form__link-icon">
          <LinkIcon size={14} />
        </span>
        <input
          className="form__input form__input--link"
          value={link}
          onChange={(event) => setLink(event.currentTarget.value)}
          placeholder="Meeting link (optional)"
          spellCheck={false}
        />
      </div>
      {link.trim() !== "" &&
        (normalizedLink && linkProvider ? (
          <ProviderIcon provider={linkProvider} link={normalizedLink} />
        ) : (
          <p className="form__hint">That doesn&apos;t look like a web link.</p>
        ))}

      <div className="form__reminder">
        <div className="form__reminder-head">
          <span className="form__label">
            <BellIcon /> {leadLongLabel(leadMinutes)}
          </span>
          <button
            type="button"
            className={`form__sound${sound ? "" : " form__sound--off"}`}
            onClick={() => setSound((current) => !current)}
            title={sound ? "Chime on" : "Chime off"}
            aria-pressed={sound}
          >
            <SpeakerIcon muted={!sound} size={13} />
            <span>{sound ? "Chime" : "Muted"}</span>
          </button>
        </div>
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
