import { useEffect, useState } from "react";
import type { ThemeMode } from "../lib/storage";

export type ResolvedTheme = "light" | "dark";

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useResolvedTheme(mode: ThemeMode): ResolvedTheme {
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === "system") return "light";
  if (mode === "light") return "dark";
  return "system";
}

export function themeLabel(mode: ThemeMode, resolved: ResolvedTheme): string {
  if (mode === "system") return `Theme: follow Windows (${resolved})`;
  return `Theme: ${mode}`;
}
