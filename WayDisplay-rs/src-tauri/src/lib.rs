mod wlr_randr;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            wlr_randr::get_display_info,
            wlr_randr::apply_settings,
            wlr_randr::check_wlr_randr
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
