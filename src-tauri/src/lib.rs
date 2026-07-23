mod catalog;
mod chat_template;
mod commands;
mod download;
mod error;
mod guardrails;
mod inference;
mod modes;
mod paths;
mod prompts;
mod state;
mod storage;

use tauri::{Manager, RunEvent};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(AppState::new(&handle));

            let _ = storage::migrate_legacy_models(&handle);

            let state = app.state::<AppState>();
            let _ = commands::sync_default_model_from_installs(&handle, &state, None);

            #[cfg(feature = "llama")]
            {
                if let Some(id) = state.get_active_id() {
                    if state.load_model_for_id(&handle, &id).is_err() {
                        let _ = state.set_active_id(&handle, None);
                        let _ = commands::sync_default_model_from_installs(&handle, &state, None);
                        if let Some(id2) = state.get_active_id() {
                            let _ = state.load_model_for_id(&handle, &id2);
                        }
                    }
                }
            }

            if let Ok(root) = paths::maguna_root(&handle) {
                let _ = std::fs::create_dir_all(&root);
            }
            if let Ok(models) = paths::models_dir(&handle) {
                let _ = std::fs::create_dir_all(&models);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_catalog,
            commands::list_installed_models,
            commands::get_active_model_id,
            commands::open_models_install_folder,
            commands::get_mode_model_binding,
            commands::set_mode_model_override,
            commands::clear_mode_model_override,
            commands::set_active_model,
            commands::delete_model,
            commands::download_model,
            commands::import_gguf,
            commands::cancel_generation,
            commands::get_modes,
            commands::set_modes,
            commands::delete_mode,
            commands::reset_mode_to_default,
            commands::run_mode,
            commands::run_mode_chat,
            commands::reset_chat_kv,
            commands::get_guardrails_settings,
            commands::set_guardrails_settings,
            commands::get_model_thinking_settings,
            commands::set_model_thinking_settings,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                #[cfg(feature = "llama")]
                {
                    app.state::<AppState>().prepare_for_exit();
                }
                #[cfg(not(feature = "llama"))]
                {
                    let _ = app;
                }
            }
        });
}
