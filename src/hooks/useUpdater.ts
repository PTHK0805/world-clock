import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus = "idle" | "checking" | "uptodate" | "available" | "downloading" | "error";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface Updater {
  status: UpdateStatus;
  version: string;
  progress: number;
  checkForUpdates: () => Promise<void>;
  install: () => Promise<void>;
}

export function useUpdater(): Updater {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState("");
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    if (!inTauri) return;
    setStatus("checking");
    try {
      const update = await check();
      if (update) {
        setPending(update);
        setVersion(update.version);
        setStatus("available");
      } else {
        setPending(null);
        setStatus("uptodate");
      }
    } catch {
      setStatus("error");
    }
  }, []);

  const install = useCallback(async () => {
    if (!pending) return;
    setStatus("downloading");
    setProgress(0);
    let total = 0;
    let received = 0;
    try {
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          setProgress(total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0);
        }
      });
      // Windows closes the app while the installer runs, so this is mostly a fallback
      await relaunch();
    } catch {
      setStatus("error");
    }
  }, [pending]);

  useEffect(() => {
    // silent check on launch (skipped in dev builds, where there is nothing to update to yet)
    if (import.meta.env.DEV) return;
    void checkForUpdates();
  }, [checkForUpdates]);

  return { status, version, progress, checkForUpdates, install };
}
