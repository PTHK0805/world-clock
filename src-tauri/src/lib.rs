use std::fs;
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Marker file written when autostart is switched off from the tray, so the
/// first-run default does not switch it back on at the next launch.
const AUTOSTART_OPTOUT: &str = "autostart-optout";

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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

            Ok(())
        })
        .on_window_event(|window, event| {
            // closing the widget keeps the app running in the tray
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
