import { cityLabel, clockParts, localZone, offsetLabel } from "../lib/timezones";
import { meetingInstant, type Meeting } from "../lib/meetings";
import { providerFor } from "../lib/links";
import { openExternal } from "../lib/window";
import { ProviderIcon } from "./ProviderIcon";
import { ChevronLeftIcon, CloudCalendarIcon } from "./icons";

interface ExternalEventCardProps {
  meeting: Meeting;
  hour12: boolean;
  onClose: () => void;
}

export function ExternalEventCard({ meeting, hour12, onClose }: ExternalEventCardProps) {
  const local = localZone();
  const instant = meetingInstant(meeting);
  const provider = providerFor(meeting.link);
  const parts = clockParts(local, instant, hour12);
  const localText = hour12 ? `${parts.hour}:${parts.minute} ${parts.dayPeriod}` : `${parts.hour}:${parts.minute}`;

  return (
    <div className="form external">
      <div className="form__header">
        <button type="button" className="icon-btn icon-btn--tiny" onClick={onClose} title="Back to calendar">
          <ChevronLeftIcon />
        </button>
        <span className="panel-hint">From Google Calendar</span>
        <span className="icon-btn icon-btn--tiny" aria-hidden="true" />
      </div>

      <p className="external__title">{meeting.title}</p>

      <div className="external__row">
        <span className="external__label">When</span>
        <span className="external__value">
          {meeting.allDay ? "All day" : meeting.time}
          {!meeting.allDay && (
            <>
              {" "}
              {cityLabel(meeting.timeZone)} {offsetLabel(meeting.timeZone, instant)}
            </>
          )}
        </span>
        <span className="external__sub">
          {new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          }).format(new Date(`${meeting.date}T00:00:00Z`))}
          {!meeting.allDay && meeting.timeZone !== local ? ` · ${localText} your time` : ""}
        </span>
      </div>

      {meeting.link && provider && (
        <button
          type="button"
          className="external__join"
          onClick={() => void openExternal(meeting.link as string)}
        >
          <ProviderIcon provider={provider} link={meeting.link} size={12} withName={false} />
          <span>Join {provider.name}</span>
        </button>
      )}

      <p className="external__note">
        <CloudCalendarIcon size={11} /> Synced from your calendar and read-only here.
      </p>
    </div>
  );
}
