import { getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";

const MIN_WIDTH = 110;
const MAX_WIDTH = 600;
const MIN_HEIGHT = 38;
const MAX_HEIGHT = 720;

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function safe(action: () => Promise<unknown>): Promise<void> {
  if (!inTauri) return;
  try {
    await action();
  } catch {
    // window is closing or the API is unavailable
  }
}

export function setPinned(pinned: boolean): Promise<void> {
  return safe(() => getCurrentWindow().setAlwaysOnTop(pinned));
}

export function closeWidget(): Promise<void> {
  return safe(() => getCurrentWindow().close());
}

export function moveTo(x: number, y: number): Promise<void> {
  return safe(() => getCurrentWindow().setPosition(new PhysicalPosition(x, y)));
}

export async function currentPosition(): Promise<{ x: number; y: number } | null> {
  if (!inTauri) return null;
  try {
    const appWindow = getCurrentWindow();
    // a minimized window reports an off-screen position (-32000), never store that
    if (await appWindow.isMinimized()) return null;
    const position = await appWindow.outerPosition();
    return { x: position.x, y: position.y };
  } catch {
    return null;
  }
}

export function startDragging(): Promise<void> {
  return safe(() => getCurrentWindow().startDragging());
}

export function openExternal(url: string): void {
  if (!inTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  void safe(() => openUrl(url));
}

export function resizeToContent(width: number, height: number): Promise<void> {
  return safe(() =>
    getCurrentWindow().setSize(
      new LogicalSize(
        Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width))),
        Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height))),
      ),
    ),
  );
}
