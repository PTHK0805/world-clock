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
import { BellIcon, ChevronLeftIcon, CloseIcon, PlusIcon } from "./icons";

interface CalendarViewProps {
  meetings: Meeting[];
  zones: string[];
  heroZone: string;
  hour12: boolean;
  onSave: (meeting: Meeting) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_MS = 86_400_000;

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function partsFromKey(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month - 1, day];
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month, 1)),
  );
}

function dayLabel(date: string, today: string): string {
  const [year, month, day] = partsFromKey(date);
  if (date === today) return "Today";
  if (date === ymdFromOffset(today, 1)) return "Tomorrow";
  if (date === ymdFromOffset(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, day)));
}

function ymdFromOffset(date: string, days: number): string {
  const [year, month, day] = partsFromKey(date);
  const shifted = new Date(Date.UTC(year, month, day) + days * DAY_MS);
  return ymd(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
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

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const leading = (first.getUTCDay() + 6) % 7; // weeks start on Monday
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    const total = Math.ceil((leading + daysInMonth) / 7) * 7;
    const start = Date.UTC(cursor.year, cursor.month, 1 - leading);
    return Array.from({ length: total }, (_, index) => {
      const date = new Date(start + index * DAY_MS);
      return {
        key: ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === cursor.month,
      };
    });
  }, [cursor]);

  const stepMonth = (delta: number) => {
    setCursor((current) => {
      const shifted = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
    });
  };

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

      <div className="cal__month">
        <button type="button" className="cal__nav" onClick={() => stepMonth(-1)} title="Previous month">
          <ChevronLeftIcon />
        </button>
        <span className="cal__month-label">{monthLabel(cursor.year, cursor.month)}</span>
        <button
          type="button"
          className="cal__nav cal__nav--next"
          onClick={() => stepMonth(1)}
          title="Next month"
        >
          <ChevronLeftIcon />
        </button>
      </div>

      <div className="cal__weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="cal__grid">
        {cells.map((cell) => (
          <button
            key={cell.key}
            type="button"
            className={`cal__day${cell.inMonth ? "" : " cal__day--outside"}${
              cell.key === today ? " cal__day--today" : ""
            }${cell.key === selected ? " cal__day--selected" : ""}`}
            onClick={() => setSelected(cell.key)}
          >
            {cell.day}
            {marked.has(cell.key) && <span className="cal__dot" />}
          </button>
        ))}
      </div>

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
