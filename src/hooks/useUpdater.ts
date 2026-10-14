import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdateStatus = "idle" | "checking" | "uptodate" | "downloading" | "ready" | "error";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface Updater {
  status: UpdateStatus;
  version: string;
  progress: number;
  checkForUpdates: () => Promise<void>;
  restart: () => Promise<void>;
}

export function useUpdater(): Updater {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState("");
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState<Update | null>(null);

  /** Fetches the package straight away, so all that's left for the user is a restart. */
  const download = useCallback(async (update: Update) => {
    setStatus("downloading");
    setProgress(0);
    let total = 0;
    let received = 0;
    try {
      await update.download((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          setProgress(total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0);
        }
      });
      setProgress(100);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!inTauri) return;
    setStatus((current) =>
      current === "downloading" || current === "ready" ? current : "checking",
    );
    try {
      const update = await check();
      if (!update) {
        setPending(null);
        setStatus("uptodate");
        return;
      }
      setPending(update);
      setVersion(update.version);
      await download(update);
    } catch {
      setStatus("error");
    }
  }, [download]);

  const restart = useCallback(async () => {
    if (!pending) return;
    try {
      // on Windows this hands off to the installer and exits; the installer relaunches
      // the app afterwards, so no manual restart is needed
      await pending.install({ restartAfterInstall: true });
    } catch {
      setStatus("error");
    }
  }, [pending]);

  useEffect(() => {
    // silent checks; skipped in dev builds, where there is nothing to update to
    if (import.meta.env.DEV) return;
    void checkForUpdates();
    const timer = window.setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkForUpdates]);

  return { status, version, progress, checkForUpdates, restart };
}
