import { useMemo, useState } from "react";
import { cityLabel, clockParts, localZone, offsetLabel } from "../lib/timezones";
import {
  agendaFor,
  leadLongLabel,
  meetingDates,
  meetingInstant,
  newMeeting,
  todayKey,
  type Meeting,
} from "../lib/meetings";
import { MeetingForm } from "./MeetingForm";
import { MonthGrid, partsFromKey, ymdFromOffset } from "./MonthGrid";
import { BellIcon, CloseIcon, PlusIcon } from "./icons";

interface CalendarViewProps {
  meetings: Meeting[];
  zones: string[];
  heroZone: string;
  hour12: boolean;
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

export function CalendarView({
  meetings,
  zones,
  heroZone,
  hour12,
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

  const marked = useMemo(() => meetingDates(meetings), [meetings]);
  const agenda = useMemo(() => agendaFor(meetings, selected), [meetings, selected]);

  const openNew = () => {
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

  const local = localZone();

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
            return (
              <button
                key={meeting.id}
                type="button"
                className="cal__row"
                onClick={() => {
                  setEditing({ meeting, mode: "edit" });
                }}
              >
                <span className="cal__row-time">{meeting.time}</span>
                <span className="cal__row-info">
                  <span className="cal__row-title">{meeting.title}</span>
                  <span className="cal__row-meta">
                    {cityLabel(meeting.timeZone)} {offsetLabel(meeting.timeZone, instant)}
                    {meeting.timeZone !== local && <span className="cal__row-local">· your {localText}</span>}
                  </span>
                </span>
                {meeting.leadMinutes !== null && (
                  <span className="cal__row-bell" title={leadLongLabel(meeting.leadMinutes)}>
                    <BellIcon size={12} />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <button type="button" className="cal__new" onClick={openNew}>
        <PlusIcon /> New meeting
      </button>
    </div>
  );
}
