import { useMemo, useState } from "react";
import { cityLabel, clockParts, localZone, offsetLabel } from "../lib/timezones";
import {
  LEAD_OPTIONS,
  agendaFor,
  leadLabel,
  leadLongLabel,
  meetingDates,
  meetingInstant,
  newMeeting,
  todayKey,
  type Meeting,
} from "../lib/meetings";
import { providerFor } from "../lib/links";
import { isGoogleCalendarUrl } from "../lib/gcal";
import { openExternal } from "../lib/window";
import { ExternalEventCard } from "./ExternalEventCard";
import { MeetingForm } from "./MeetingForm";
import { MonthGrid, partsFromKey, ymdFromOffset } from "./MonthGrid";
import { ProviderIcon } from "./ProviderIcon";
import { BellIcon, CloudCalendarIcon, CloseIcon, PlusIcon, RefreshIcon } from "./icons";

export interface GoogleSync {
  url: string | null;
  leadMinutes: number | null;
  fetchedAt: number | null;
  unexpandedSeries: number;
  eventCount: number;
  syncing: boolean;
  error: string | null;
  onSubscribe: (url: string) => void;
  onLead: (lead: number | null) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}

interface CalendarViewProps {
  meetings: Meeting[];
  zones: string[];
  heroZone: string;
  hour12: boolean;
  google: GoogleSync;
  onSave: (meeting: Meeting) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === ymdFromOffset(today, 1)) return "Tomorrow";
  if (date === ymdFromOffset(today, -1)) return "Yesterday";
  const [year, month, day] = partsFromKey(date);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, day)));
}

function relativeTime(fetchedAt: number | null): string {
  if (!fetchedAt) return "never synced";
  const minutes = Math.round((Date.now() - fetchedAt) / 60_000);
  if (minutes < 1) return "synced just now";
  if (minutes < 60) return `synced ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `synced ${hours} h ago`;
  return `synced ${Math.round(hours / 24)} d ago`;
}

export function CalendarView({
  meetings,
  zones,
  heroZone,
  hour12,
  google,
  onSave,
  onDelete,
  onClose,
}: CalendarViewProps) {
  const today = todayKey(heroZone);
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState(() => {
    const [year, month] = partsFromKey(today);
    return { year, month };
  });
  const [editing, setEditing] = useState<{ meeting: Meeting; mode: "new" | "edit" } | null>(null);
  const [viewing, setViewing] = useState<Meeting | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(google.url ?? "");

  const marked = useMemo(() => meetingDates(meetings), [meetings]);
  const agenda = useMemo(() => agendaFor(meetings, selected), [meetings, selected]);

  const openNew = () => {
    setViewing(null);
    setEditing({ meeting: newMeeting(selected, heroZone), mode: "new" });
  };

  if (editing) {
    return (
      <MeetingForm
        draft={editing.meeting}
        mode={editing.mode}
        zones={zones}
        heroZone={heroZone}
        hour12={hour12}
        marked={marked}
        onSave={(meeting) => {
          onSave(meeting);
          setSelected(meeting.date);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
        onDelete={(id) => {
          onDelete(id);
          setEditing(null);
        }}
      />
    );
  }

  if (viewing) {
    return <ExternalEventCard meeting={viewing} hour12={hour12} onClose={() => setViewing(null)} />;
  }

  const local = localZone();
  const connected = google.url !== null;

  return (
    <div className="cal">
      <div className="cal__header">
        <p className="panel-hint">Calendar</p>
        <button type="button" className="icon-btn icon-btn--tiny" onClick={onClose} title="Back to the clock">
          <CloseIcon size={12} />
        </button>
      </div>

      <MonthGrid
        year={cursor.year}
        month={cursor.month}
        selected={selected}
        today={today}
        marked={marked}
        onSelect={setSelected}
        onMonthChange={(year, month) => setCursor({ year, month })}
      />

      <div className="cal__agenda">
        <div className="cal__agenda-head">
          <span className="cal__agenda-day">{dayLabel(selected, today)}</span>
          <span className="cal__agenda-date">{selected}</span>
        </div>
        {agenda.length === 0 ? (
          <p className="cal__empty">No meetings on this day.</p>
        ) : (
          agenda.map((meeting) => {
            const instant = meetingInstant(meeting);
            const localParts = clockParts(local, instant, hour12);
            const localText = hour12
              ? `${localParts.hour}:${localParts.minute} ${localParts.dayPeriod}`
              : `${localParts.hour}:${localParts.minute}`;
            const joinLink = meeting.link;
            const provider = providerFor(joinLink);
            const imported = meeting.source === "google";
            return (
              <div key={meeting.id} className="cal__row">
                <button
                  type="button"
                  className="cal__row-main"
                  onClick={() => {
                    if (imported) setViewing(meeting);
                    else setEditing({ meeting, mode: "edit" });
                  }}
                >
                  <span className="cal__row-time">{meeting.allDay ? "All day" : meeting.time}</span>
                  <span className="cal__row-info">
                    <span className="cal__row-title">
                      {imported && (
                        <span className="cal__row-source" title="From Google Calendar">
                          <CloudCalendarIcon size={10} />
                        </span>
                      )}
                      {meeting.title}
                    </span>
                    <span className="cal__row-meta">
                      {cityLabel(meeting.timeZone)} {offsetLabel(meeting.timeZone, instant)}
                      {joinLink && provider && <span className="cal__row-provider">· {provider.name}</span>}
                      {meeting.timeZone !== local && <span className="cal__row-local">· your {localText}</span>}
                    </span>
                  </span>
                </button>
                {joinLink && provider && (
                  <button
                    type="button"
                    className="cal__join"
                    onClick={() => void openExternal(joinLink)}
                    title={`Join ${provider.name}`}
                  >
                    <ProviderIcon provider={provider} link={joinLink} size={11} withName={false} />
                  </button>
                )}
                {meeting.leadMinutes !== null && !meeting.allDay && (
                  <span className="cal__row-bell" title={leadLongLabel(meeting.leadMinutes)}>
                    <BellIcon size={12} />
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      <button type="button" className="cal__new" onClick={openNew}>
        <PlusIcon /> New meeting
      </button>

      <div className={`gcal${panelOpen ? " gcal--open" : ""}`}>
        <button type="button" className="gcal__head" onClick={() => setPanelOpen((open) => !open)}>
          <span className="gcal__title">
            <CloudCalendarIcon /> Google Calendar
          </span>
          <span className="gcal__status">
            {connected ? `${google.eventCount} events · ${relativeTime(google.fetchedAt)}` : "Not connected"}
          </span>
        </button>

        {panelOpen && !connected && (
          <>
            <p className="gcal__hint">
              Paste the secret iCal address from Google Calendar → Settings → your calendar → &quot;Secret
              address in iCal format&quot;.
            </p>
            <div className="form__link">
              <span className="form__link-icon">
                <CloudCalendarIcon size={14} />
              </span>
              <input
                className="form__input form__input--link"
                value={draftUrl}
                onChange={(event) => setDraftUrl(event.currentTarget.value)}
                placeholder="https://calendar.google.com/calendar/ical/…"
                spellCheck={false}
              />
            </div>
            {google.error && <p className="form__error">{google.error}</p>}
            <button
              type="button"
              className="form__save"
              disabled={google.syncing || !isGoogleCalendarUrl(draftUrl)}
              onClick={() => google.onSubscribe(draftUrl)}
            >
              {google.syncing ? "Connecting…" : "Connect"}
            </button>
          </>
        )}

        {panelOpen && connected && (
          <>
            <span className="form__label">Remind me</span>
            <div className="form__chips">
              {LEAD_OPTIONS.map((option) => (
                <button
                  key={String(option)}
                  type="button"
                  className={`form__chip${option === google.leadMinutes ? " form__chip--active" : ""}`}
                  onClick={() => google.onLead(option)}
                >
                  {leadLabel(option)}
                </button>
              ))}
            </div>
            <p className="gcal__hint">
              {relativeTime(google.fetchedAt)} · Google caches this feed, so changes can take a while to
              appear here.
            </p>
            {google.unexpandedSeries > 0 && (
              <p className="gcal__hint">
                {google.unexpandedSeries} repeating event{google.unexpandedSeries === 1 ? "" : "s"} use a
                pattern this widget can&apos;t expand yet, so they&apos;re left out.
              </p>
            )}
            {google.error && <p className="form__error">{google.error}</p>}
            <div className="gcal__actions">
              <button
                type="button"
                className="gcal__action"
                onClick={google.onRefresh}
                disabled={google.syncing}
              >
                <RefreshIcon /> {google.syncing ? "Syncing…" : "Refresh"}
              </button>
              <button type="button" className="gcal__action" onClick={google.onDisconnect}>
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
