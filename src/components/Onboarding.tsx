import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface TourStep {
  /** `data-tour` value of the element to spotlight; omitted for a centered message. */
  target?: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to Meridian",
    body: "A quick tour of the controls. Drag anywhere on the bar to move the widget — settings save themselves.",
  },
  {
    target: "calendar",
    title: "Calendar & meetings",
    body: "Plan meetings across timezones, add reminders, and connect a Google Calendar feed.",
  },
  {
    target: "info",
    title: "About & updates",
    body: "Version, developer links and update status. A dot appears when an update is ready — replay this tour here.",
  },
  {
    target: "theme",
    title: "Theme",
    body: "Cycles follow Windows → light → dark. The icon shows the current mode.",
  },
  {
    target: "compact",
    title: "Compact mode",
    body: "Shrinks the widget to a small time-only pill. Click the pill to expand it again.",
  },
  {
    target: "pin",
    title: "Keep on top",
    body: "Pins the widget above other windows. Purple means pinned; click again to unpin.",
  },
  {
    target: "close",
    title: "Hide to tray",
    body: "Closes the window but keeps the app running. Quit from the tray menu instead.",
  },
  {
    target: "hero-zone",
    title: "Switch the main clock",
    body: "Click the city name to show another timezone in the big clock — or pick Local time to follow Windows.",
  },
  {
    target: "add-zone",
    title: "Track another city",
    body: "Add timezone opens a searchable city list. Added cities appear under the main clock.",
  },
  {
    target: "format",
    title: "12-hour or 24-hour",
    body: "Tap 24h / 12h to switch the format everywhere in the app.",
  },
  {
    title: "You're all set",
    body: "The widget lives in the tray: right-click the icon for Show / Hide, Start with Windows, and Quit. Replay this tour from About.",
  },
];

const SPOT_PAD = 5;
const CARD_GAP = 10;
const EDGE = 10;

interface Spot {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CardPosition {
  top: number;
  left: number;
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [cardPos, setCardPos] = useState<CardPosition | null>(null);
  const [resizeTick, setResizeTick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = STEPS[index] ?? STEPS[0]!;
  const isLast = index === STEPS.length - 1;

  const measure = useCallback(() => {
    setResizeTick((current) => current + 1);
    const root = rootRef.current;
    const widget = root?.parentElement;
    if (!root) return;
    if (!step.target || !widget) {
      setSpot(null);
      return;
    }
    const target = widget.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!target) {
      setSpot(null);
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const width = rootRect.width;
    const height = rootRect.height;
    const left = Math.max(0, rect.left - rootRect.left - SPOT_PAD);
    const top = Math.max(0, rect.top - rootRect.top - SPOT_PAD);
    const right = Math.min(width, rect.right - rootRect.left + SPOT_PAD);
    const bottom = Math.min(height, rect.bottom - rootRect.top + SPOT_PAD);
    setSpot({ left, top, width: right - left, height: bottom - top });
  }, [step.target]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, index]);

  // The card is measured before placing it, so long steps never overflow the widget.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const root = rootRef.current;
    if (!card || !root) return;
    const { width, height } = root.getBoundingClientRect();
    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    if (!spot) {
      setCardPos({
        left: Math.max(EDGE, (width - cardWidth) / 2),
        top: Math.max(EDGE, (height - cardHeight) / 2),
      });
      return;
    }
    const centered = spot.left + spot.width / 2 - cardWidth / 2;
    const left = Math.min(Math.max(EDGE, centered), Math.max(EDGE, width - cardWidth - EDGE));
    const below = spot.top + spot.height + CARD_GAP;
    const above = spot.top - CARD_GAP - cardHeight;
    const top =
      below + cardHeight <= height - EDGE
        ? below
        : above >= EDGE
          ? above
          : Math.min(Math.max(EDGE, below), Math.max(EDGE, height - cardHeight - EDGE));
    setCardPos({ left, top: Math.min(Math.max(EDGE, top), Math.max(EDGE, height - cardHeight - EDGE)) });
  }, [spot, index, resizeTick]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDone();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((current) => Math.min(current + 1, STEPS.length - 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => Math.max(current - 1, 0));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDone]);

  return (
    <div className="tour" ref={rootRef} role="dialog" aria-modal="true" aria-label="Guided tour">
      {spot ? (
        <span
          className="tour__spot"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      ) : (
        <span className="tour__dim" />
      )}

      <div
        className="tour__card"
        ref={cardRef}
        tabIndex={-1}
        aria-live="polite"
        style={{
          top: cardPos?.top ?? EDGE,
          left: cardPos?.left ?? EDGE,
          visibility: cardPos ? "visible" : "hidden",
        }}
      >
        <p className="tour__step">
          Step {index + 1} of {STEPS.length}
        </p>
        <p className="tour__title">{step.title}</p>
        <p className="tour__body">{step.body}</p>
        <div className="tour__actions">
          {isLast ? (
            <span />
          ) : (
            <button type="button" className="tour__button tour__button--ghost" onClick={onDone}>
              Skip
            </button>
          )}
          <div className="tour__nav">
            {index > 0 && (
              <button
                type="button"
                className="tour__button"
                onClick={() => setIndex((current) => Math.max(current - 1, 0))}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="tour__button tour__button--primary"
              onClick={() => (isLast ? onDone() : setIndex((current) => current + 1))}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
