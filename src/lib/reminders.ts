import { invoke } from "@tauri-apps/api/core";
import type { PendingReminder } from "./meetings";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Hands the upcoming reminders to the Rust scheduler, which fires them even when the widget is hidden. */
export async function syncReminders(reminders: PendingReminder[]): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke("sync_reminders", { reminders });
  } catch {
    // scheduler unavailable: reminders simply won't fire
  }
}

export async function focusMain(): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke("focus_main");
  } catch {
    // ignore
  }
}
