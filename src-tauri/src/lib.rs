mod auth;
mod commands;
mod config;
mod gh_login;
mod github;
mod poller;
mod state;

use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tracing::warn;

/// Bring the main window back to the foreground from the tray.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "approve_bot_lib=info,warn".into()),
        )
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .expect("could not resolve app config dir");
            std::fs::create_dir_all(&config_dir).ok();

            let cfg = match config::load(&config_dir) {
                Ok(c) => c,
                Err(e) => {
                    warn!(error = %e, "failed to load config; using defaults");
                    config::AppConfig::default()
                }
            };
            let state = state::AppState::new(config_dir, cfg);
            app.manage(Arc::clone(&state));

            poller::spawn(app.handle().clone(), state);

            // System tray (menu bar) icon so the app keeps polling in the
            // background after the window is closed.
            let show_item = MenuItem::with_id(app, "show", "열기", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Approve Bot")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
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
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Closing the window hides it to the tray instead of quitting.
            if let Some(win) = app.get_webview_window("main") {
                let win_for_close = win.clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_for_close.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_connection_status,
            commands::reconnect,
            commands::get_config,
            commands::update_config,
            commands::get_activity_log,
            commands::force_check_now,
            commands::search_users,
            commands::start_gh_login,
            commands::get_autostart,
            commands::set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
