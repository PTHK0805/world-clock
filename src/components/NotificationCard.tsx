import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";
import { ProviderIcon } from "./ProviderIcon";
import { useResolvedTheme } from "../hooks/useTheme";
import { loadSettings } from "../lib/storage";
import { closeWidget, openExternal } from "../lib/window";
import { focusMain } from "../lib/reminders";
import { playReminderChime } from "../lib/chime";
import { normalizeLink, providerFor } from "../lib/links";

const AUTO_DISMISS_MS = 20_000;
const CLOSE_ANIMATION_MS = 160;

interface NotificationCardProps {
  title: string;
  body: string;
  sound: boolean;
  link: string | null;
}

export function NotificationCard({ title, body, sound, link }: NotificationCardProps) {
  const [themeMode] = useState(() => loadSettings().theme);
  const resolvedTheme = useResolvedTheme(themeMode);
  const [closing, setClosing] = useState(false);
  const played = useRef(false);

  useEffect(() => {
    // guarded so the chime still plays exactly once under StrictMode's double effect
    if (!sound || played.current) return;
    played.current = true;
    playReminderChime();
  }, [sound]);

  const dismiss = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => void closeWidget(), CLOSE_ANIMATION_MS);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [dismiss]);

  // the link arrives through a URL query param, so re-check it is http(s) before opening
  const safeLink = normalizeLink(link);
  const provider = providerFor(safeLink);

  const activate = () => {
    // a meeting link is the more useful action, so it wins over bringing the widget forward
    if (safeLink) {
      void openExternal(safeLink);
    } else {
      void focusMain();
    }
    dismiss();
  };

  return (
    <div className={`notify${closing ? " notify--closing" : ""}`} data-theme={resolvedTheme}>
      <button
        type="button"
        className="notify__main"
        onClick={activate}
        title={provider && safeLink ? `Join ${provider.name}` : "Open World Clock"}
      >
        {provider ? (
          <ProviderIcon provider={provider} link={safeLink} size={13} withName={false} />
        ) : (
          <span className="notify__dot" />
        )}
        <span className="notify__text">
          <span className="notify__title">{title}</span>
          <span className="notify__body">{body}</span>
        </span>
        {safeLink && provider && <span className="notify__join">Join</span>}
      </button>
      <button type="button" className="notify__close" onClick={dismiss} title="Dismiss">
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
