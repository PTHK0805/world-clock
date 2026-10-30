use std::{
    collections::HashSet,
    fs,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Marker file written when autostart is switched off from the tray, so the
/// first-run default does not switch it back on at the next launch.
const AUTOSTART_OPTOUT: &str = "autostart-optout";

/// Label of the reminder window. Only one is ever on screen.
const NOTIFY_LABEL: &str = "notify";

/// Reminders are polled on this interval rather than sleeping until the next one,
/// so a change from the frontend takes effect immediately.
const SCHEDULER_TICK: Duration = Duration::from_secs(5);

const NOTIFY_WIDTH: f64 = 340.0;
const NOTIFY_HEIGHT: f64 = 88.0;

/// WebView2 blocks audio until a user gesture; the reminder card is shown without any
/// interaction, so the chime needs explicit permission. The first switch restates
/// WebView2's own defaults, which specifying additional args would otherwise drop.
const NOTIFY_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

/// A reminder prepared by the frontend: all display strings are already formatted there.
#[derive(Clone, Serialize, Deserialize)]
struct Reminder {
    id: String,
    #[serde(rename = "fireAtMs")]
    fire_at_ms: i64,
    title: String,
    body: String,
    #[serde(default = "default_sound")]
    sound: bool,
    #[serde(default)]
    link: Option<String>,
}

fn default_sound() -> bool {
    true
}

#[derive(Default)]
struct ReminderState {
    pending: Mutex<Vec<Reminder>>,
    fired: Mutex<HashSet<String>>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

fn optout_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(AUTOSTART_OPTOUT))
}

fn set_autostart(app: &AppHandle, enabled: bool) {
    let autolaunch = app.autolaunch();
    if enabled {
        let _ = autolaunch.enable();
        if let Some(path) = optout_path(app) {
            let _ = fs::remove_file(path);
        }
    } else {
        let _ = autolaunch.disable();
        if let Some(path) = optout_path(app) {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(path, "autostart disabled from tray\n");
        }
    }
}

fn toggle_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(*byte as char),
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

/// Shows the custom reminder card, bottom-right of the primary monitor.
fn show_notification(app: &AppHandle, reminder: &Reminder) {
    if let Some(existing) = app.get_webview_window(NOTIFY_LABEL) {
        let _ = existing.close();
    }

    let query = format!(
        "index.html?view=notification&title={}&body={}&sound={}&link={}",
        percent_encode(&reminder.title),
        percent_encode(&reminder.body),
        if reminder.sound { 1 } else { 0 },
        percent_encode(reminder.link.as_deref().unwrap_or("")),
    );

    let builder = WebviewWindowBuilder::new(app, NOTIFY_LABEL, WebviewUrl::App(query.into()))
        .title("Meeting reminder")
        .additional_browser_args(NOTIFY_BROWSER_ARGS)
        .inner_size(NOTIFY_WIDTH, NOTIFY_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false);

    let Ok(window) = builder.build() else {
        return;
    };

    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = monitor.scale_factor();
        let size = monitor.size();
        let origin = monitor.position();
        let width = (NOTIFY_WIDTH * scale) as i32;
        let height = (NOTIFY_HEIGHT * scale) as i32;
        let margin = (20.0 * scale) as i32;
        let taskbar_gap = (64.0 * scale) as i32;
        let x = origin.x + size.width as i32 - width - margin;
        let y = origin.y + size.height as i32 - height - taskbar_gap;
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }

    let _ = window.show();
}

/// Replaces the pending reminder list. Anything already due or past is dropped,
/// so restarting the app never re-fires an old reminder.
#[tauri::command]
fn sync_reminders(state: State<'_, ReminderState>, reminders: Vec<Reminder>) {
    let now = now_ms();
    let mut pending = state.pending.lock().unwrap();
    let mut fired = state.fired.lock().unwrap();
    let scheduled: HashSet<String> = reminders.iter().map(|reminder| reminder.id.clone()).collect();
    fired.retain(|id| scheduled.contains(id));
    let mut upcoming: Vec<Reminder> = reminders
        .into_iter()
        .filter(|reminder| reminder.fire_at_ms > now)
        .collect();
    upcoming.sort_by_key(|reminder| reminder.fire_at_ms);
    *pending = upcoming;
}

/// Brings the widget forward — used when the reminder card is clicked.
#[tauri::command]
fn focus_main(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn spawn_scheduler(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(SCHEDULER_TICK);
        let state = handle.state::<ReminderState>();
        let now = now_ms();
        let due: Vec<Reminder> = {
            let pending = state.pending.lock().unwrap();
            let fired = state.fired.lock().unwrap();
            pending
                .iter()
                .filter(|reminder| reminder.fire_at_ms <= now && !fired.contains(&reminder.id))
                .cloned()
                .collect()
        };
        for reminder in due {
            {
                let mut fired = state.fired.lock().unwrap();
                if !fired.insert(reminder.id.clone()) {
                    continue;
                }
            }
            show_notification(&handle, &reminder);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Registered first: a second launch hands its arguments to this instance and
        // exits instead of starting a duplicate app and tray icon.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ReminderState::default())
        .invoke_handler(tauri::generate_handler![sync_reminders, focus_main])
        .setup(|app| {
            let handle = app.handle().clone();

            // Enabled on first run; a marker file keeps an explicit "off" from the tray.
            let opted_out = optout_path(&handle).map(|path| path.exists()).unwrap_or(false);
            if !opted_out {
                let _ = handle.autolaunch().enable();
            }

            let toggle_item = MenuItemBuilder::with_id("toggle", "Show / Hide").build(app)?;
            let autostart_item = CheckMenuItemBuilder::with_id("autostart", "Start with Windows")
                .checked(handle.autolaunch().is_enabled().unwrap_or(false))
                .build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&toggle_item, &autostart_item, &quit_item])
                .build()?;

            let autostart_for_menu = autostart_item.clone();
            let tray = TrayIconBuilder::with_id("main")
                .tooltip("World Clock")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "toggle" => toggle_window(app),
                    "autostart" => {
                        let next = !autostart_for_menu.is_checked().unwrap_or(false);
                        let _ = autostart_for_menu.set_checked(next);
                        set_autostart(app, next);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                });

            let tray = match app.default_window_icon() {
                Some(icon) => tray.icon(icon.clone()),
                None => tray,
            };
            tray.build(app)?;

            spawn_scheduler(&handle);

            Ok(())
        })
        .on_window_event(|window, event| {
            // closing the widget keeps the app running in the tray; the reminder card
            // closes for real
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
