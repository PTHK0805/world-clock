import { useEffect, useRef } from "react";

const HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1);
const HOURS_24 = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const MERIDIEM = ["AM", "PM"];

interface TimePickerProps {
  /** Wall time as 24h `HH:MM`. */
  value: string;
  hour12: boolean;
  onChange: (value: string) => void;
}

export function formatTime(value: string, hour12: boolean): string {
  const [hourText, minuteText] = value.split(":");
  const hour24 = Number(hourText);
  if (!hour12) return `${hourText.padStart(2, "0")}:${minuteText.padStart(2, "0")}`;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(hour).padStart(2, "0")}:${minuteText.padStart(2, "0")} ${period}`;
}

export function TimePicker({ value, hour12, onChange }: TimePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hourText, minuteText] = value.split(":");
  const hour24 = Number(hourText);
  const minute = Number(minuteText);
  const isPm = hour24 >= 12;

  // bring the current values into view, in every column
  useEffect(() => {
    containerRef.current?.querySelectorAll(".time__option--active").forEach((option) => {
      option.scrollIntoView({ block: "center" });
    });
  }, []);

  const setHour = (next: number) => {
    const clamped = Math.max(0, Math.min(23, next));
    onChange(`${String(clamped).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  };

  const setMinute = (next: number) => {
    onChange(`${String(hour24).padStart(2, "0")}:${String(next).padStart(2, "0")}`);
  };

  const setMeridiem = (pm: boolean) => {
    const hour12Value = hour24 % 12;
    setHour(pm ? hour12Value + 12 : hour12Value);
  };

  return (
    <div className="time" ref={containerRef}>
      <div className="time__column">
        {(hour12 ? HOURS_12 : HOURS_24).map((hour) => {
          const target = hour12 ? (isPm ? (hour % 12) + 12 : hour % 12) : hour;
          return (
            <button
              key={hour}
              type="button"
              className={`time__option${target === hour24 ? " time__option--active" : ""}`}
              onClick={() => setHour(target)}
            >
              {hour12 ? hour : String(hour).padStart(2, "0")}
            </button>
          );
        })}
      </div>

      <div className="time__column">
        {MINUTES.map((entry) => (
          <button
            key={entry}
            type="button"
            className={`time__option${entry === minute ? " time__option--active" : ""}`}
            onClick={() => setMinute(entry)}
          >
            {String(entry).padStart(2, "0")}
          </button>
        ))}
      </div>

      {hour12 && (
        <div className="time__column time__column--meridiem">
          {MERIDIEM.map((label) => {
            const pm = label === "PM";
            return (
              <button
                key={label}
                type="button"
                className={`time__option${pm === isPm ? " time__option--active" : ""}`}
                onClick={() => setMeridiem(pm)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
