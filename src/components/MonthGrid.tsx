import { useMemo } from "react";
import { ChevronLeftIcon } from "./icons";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_MS = 86_400_000;

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function partsFromKey(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month - 1, day];
}

export function ymdFromOffset(date: string, days: number): string {
  const [year, month, day] = partsFromKey(date);
  const shifted = new Date(Date.UTC(year, month, day) + days * DAY_MS);
  return ymd(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month, 1)),
  );
}

export function shortDateLabel(date: string): string {
  const [year, month, day] = partsFromKey(date);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, day)));
}

interface MonthGridProps {
  year: number;
  month: number;
  selected: string;
  today: string;
  marked?: Set<string>;
  onSelect: (date: string) => void;
  onMonthChange: (year: number, month: number) => void;
}

export function MonthGrid({
  year,
  month,
  selected,
  today,
  marked,
  onSelect,
  onMonthChange,
}: MonthGridProps) {
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month, 1));
    const leading = (first.getUTCDay() + 6) % 7; // weeks start on Monday
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const total = Math.ceil((leading + daysInMonth) / 7) * 7;
    const start = Date.UTC(year, month, 1 - leading);
    return Array.from({ length: total }, (_, index) => {
      const date = new Date(start + index * DAY_MS);
      return {
        key: ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month,
      };
    });
  }, [year, month]);

  const step = (delta: number) => {
    const shifted = new Date(Date.UTC(year, month + delta, 1));
    onMonthChange(shifted.getUTCFullYear(), shifted.getUTCMonth());
  };

  return (
    <div className="month">
      <div className="month__head">
        <button type="button" className="month__nav" onClick={() => step(-1)} title="Previous month">
          <ChevronLeftIcon />
        </button>
        <span className="month__label">{monthLabel(year, month)}</span>
        <button
          type="button"
          className="month__nav month__nav--next"
          onClick={() => step(1)}
          title="Next month"
        >
          <ChevronLeftIcon />
        </button>
      </div>

      <div className="month__weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="month__grid">
        {cells.map((cell) => (
          <button
            key={cell.key}
            type="button"
            className={`month__day${cell.inMonth ? "" : " month__day--outside"}${
              cell.key === today ? " month__day--today" : ""
            }${cell.key === selected ? " month__day--selected" : ""}`}
            onClick={() => onSelect(cell.key)}
          >
            {cell.day}
            {marked?.has(cell.key) && <span className="month__dot" />}
          </button>
        ))}
      </div>
    </div>
  );
}
