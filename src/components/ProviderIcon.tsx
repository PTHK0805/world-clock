import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { MeetingProvider } from "../lib/links";
import { LinkIcon, VideoIcon } from "./icons";

interface ProviderIconProps {
  provider: MeetingProvider;
  link: string | null;
  size?: number;
  withName?: boolean;
}

/**
 * Pulls the real favicon from the meeting's own host, falling back to a favicon
 * service and finally to a glyph if the network is unavailable.
 */
export function ProviderIcon({ provider, link, size = 11, withName = true }: ProviderIconProps) {
  const sources = useMemo(() => {
    if (!link) return [];
    try {
      const url = new URL(link);
      return [
        `${url.origin}/favicon.ico`,
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`,
      ];
    } catch {
      return [];
    }
  }, [link]);

  const sourceKey = sources.join("|");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [sourceKey]);

  const src = sources[index];
  const box = Math.max(size + 7, 18);

  return (
    <span className="provider">
      {src ? (
        <span className="provider__icon provider__icon--image" style={{ width: box, height: box }}>
          <img
            src={src}
            alt=""
            draggable={false}
            onError={() => setIndex((current) => current + 1)}
          />
        </span>
      ) : (
        <span
          className="provider__icon"
          style={
            { "--provider-color": provider.color, width: box, height: box } as CSSProperties
          }
        >
          {provider.video ? <VideoIcon size={size} /> : <LinkIcon size={size} />}
        </span>
      )}
      {withName && <span className="provider__name">{provider.name}</span>}
    </span>
  );
}
