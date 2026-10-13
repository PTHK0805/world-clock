import { useCallback, useEffect, useState } from "react";
import { loadSettings, saveSettings, type Settings } from "../lib/storage";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  return { settings, update };
}
