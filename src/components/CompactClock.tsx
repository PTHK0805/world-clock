import { useCallback, type MouseEvent } from "react";
import { cityLabel, clockParts } from "../lib/timezones";
import { startDragging } from "../lib/window";
import { ExpandIcon } from "./icons";

const DRAG_THRESHOLD = 4;

interface CompactClockProps {
  timeZone: string;
  now: Date;
  hour12: boolean;
  onExpand: () => void;
}

export function CompactClock({ timeZone, now, hour12, onExpand }: CompactClockProps) {
  const parts = clockParts(timeZone, now, hour12);

  // Dragging and clicking share the same mouse button, so treat it as a click
  // (expand) until the pointer actually travels far enough to be a drag.
  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const startX = event.screenX;
      const startY = event.screenY;
      let dragging = false;

      const handleMove = (moveEvent: globalThis.MouseEvent) => {
        if (dragging) return;
        if (
          Math.abs(moveEvent.screenX - startX) > DRAG_THRESHOLD ||
          Math.abs(moveEvent.screenY - startY) > DRAG_THRESHOLD
        ) {
          dragging = true;
          void startDragging();
        }
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        if (!dragging) onExpand();
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [onExpand],
  );

  return (
    <div
      className="compact"
      onMouseDown={handleMouseDown}
      title={`${cityLabel(timeZone)} — click to expand, drag to move`}
    >
      <span className="compact__time">
        {parts.hour}
        <span className="compact__colon">:</span>
        {parts.minute}
      </span>
      <span className="compact__seconds">{parts.second}</span>
      {parts.dayPeriod && <span className="compact__period">{parts.dayPeriod}</span>}
      <span className="compact__hint">
        <ExpandIcon />
      </span>
    </div>
  );
}
