fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![drawit_session])
        .run(tauri::generate_context!())
        .expect("error while running drawit");
}

#[tauri::command]
fn drawit_session() -> Result<serde_json::Value, String> {
    let path = if let Ok(home) = std::env::var("DRAWIT_HOME") {
        std::path::PathBuf::from(home).join("session.json")
    } else {
        let base = std::env::var("APPDATA").map_err(|error| error.to_string())?;
        std::path::PathBuf::from(base).join("drawit").join("session.json")
    };
    let text = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}
