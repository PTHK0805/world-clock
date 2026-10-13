import { ZoneRow } from "./ZoneRow";

interface ZoneListProps {
  zones: string[];
  referenceZone: string;
  now: Date;
  hour12: boolean;
  onRemove: (timeZone: string) => void;
}

export function ZoneList({ zones, referenceZone, now, hour12, onRemove }: ZoneListProps) {
  if (zones.length === 0) {
    return <p className="empty">No cities yet — add a timezone to track another part of the world.</p>;
  }

  return (
    <div className="zones">
      {zones.map((zone) => (
        <ZoneRow
          key={zone}
          timeZone={zone}
          referenceZone={referenceZone}
          now={now}
          hour12={hour12}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
