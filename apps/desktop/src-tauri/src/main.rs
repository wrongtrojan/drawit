#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::OpenOptions,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
};
use tauri::Manager;
mod files;

struct SessionProcess(Mutex<Option<Child>>);
impl Drop for SessionProcess {
    fn drop(&mut self) {
        if let Some(mut child) = self.0.lock().unwrap().take() {
            drop(child.stdin.take());
            for _ in 0..40 {
                if child.try_wait().ok().flatten().is_some() {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

struct DesktopConfig {
    home: PathBuf,
    runtime: Option<PathBuf>,
    last_restart: Mutex<std::time::Instant>,
    mcp: serde_json::Value,
}

fn plain_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    text.strip_prefix(r"\\?\")
        .map(PathBuf::from)
        .unwrap_or_else(|| path.to_path_buf())
}

fn runtime_command(runtime: &std::path::Path, entry: &str) -> Command {
    let runtime = plain_path(runtime);
    let mut command = Command::new(runtime.join(if cfg!(windows) { "node.exe" } else { "node" }));
    command.arg(runtime.join(entry));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    command
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--mcp") {
        let runtime = args
            .windows(2)
            .find(|pair| pair[0] == "--runtime")
            .map(|pair| PathBuf::from(&pair[1]));
        let Some(runtime) = runtime else {
            eprintln!("drawit --mcp requires --runtime from the copied MCP configuration");
            std::process::exit(1);
        };
        match runtime_command(&runtime, "mcp.cjs").status() {
            Ok(status) => std::process::exit(status.code().unwrap_or(1)),
            Err(error) => {
                eprintln!("Cannot start drawit MCP: {error}");
                std::process::exit(1);
            }
        }
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let home = plain_path(&std::env::var("DRAWIT_HOME").map(PathBuf::from).unwrap_or(app.path().app_data_dir()?.with_file_name("drawit")));
            std::fs::create_dir_all(&home)?;
            app.manage(files::FileBroker::new(home.clone()));
            let runtime = plain_path(&app.path().resource_dir()?.join("runtime"));
            let (child, command, arguments) = if cfg!(debug_assertions) {
                let root = plain_path(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..").canonicalize()?);
                (None, "node".to_string(), vec![root.join("packages/mcp/node_modules/tsx/dist/cli.mjs").to_string_lossy().into_owned(), root.join("packages/mcp/src/index.ts").to_string_lossy().into_owned()])
            } else {
                std::fs::create_dir_all(&home)?;
                let stderr = OpenOptions::new().create(true).append(true).open(home.join("session.log")).map(Stdio::from).unwrap_or(Stdio::null());
                let child = runtime_command(&runtime, "session.cjs")
                    .env("DRAWIT_HOME", &home).env("DRAWIT_MANAGED_SESSION", "1")
                    .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(stderr).spawn()?;
                (Some(child), plain_path(&std::env::current_exe()?).to_string_lossy().into_owned(), vec!["--mcp".to_string(), "--runtime".to_string(), runtime.to_string_lossy().into_owned()])
            };
            app.manage(SessionProcess(Mutex::new(child)));
            app.manage(DesktopConfig { home: home.clone(), runtime: if cfg!(debug_assertions) { None } else { Some(runtime) }, last_restart: Mutex::new(std::time::Instant::now()), mcp: serde_json::json!({ "mcpServers": { "drawit": { "command": command, "args": arguments, "env": { "DRAWIT_HOME": home } } } }) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![drawit_session, drawit_mcp_config, drawit_diagnostic, drawit_confirm_action, files::drawit_choose_directory, files::drawit_write_artifact, files::drawit_external_file])
        .build(tauri::generate_context!())
        .expect("error while building drawit")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, code: None, .. } = event {
                // Route Cmd+Q/menu quit through the same unsaved-close protection.
                if let Some(window) = app.get_webview_window("main") {
                    api.prevent_exit();
                    let _ = window.close();
                }
            }
        });
}

#[tauri::command]
fn drawit_session(
    config: tauri::State<'_, DesktopConfig>,
    process: tauri::State<'_, SessionProcess>,
) -> Result<serde_json::Value, String> {
    if let Some(runtime) = &config.runtime {
        let mut owned = process.0.lock().map_err(|e| e.to_string())?;
        let exited = match owned.as_mut() {
            Some(child) => child.try_wait().map_err(|e| e.to_string())?.is_some(),
            None => true,
        };
        if exited {
            let mut last = config.last_restart.lock().map_err(|e| e.to_string())?;
            if last.elapsed() < std::time::Duration::from_secs(2) {
                return Err("绘图会话已退出，正在等待重新启动".into());
            }
            *last = std::time::Instant::now();
            let stderr = OpenOptions::new()
                .create(true)
                .append(true)
                .open(config.home.join("session.log"))
                .map(Stdio::from)
                .unwrap_or(Stdio::null());
            *owned = Some(
                runtime_command(runtime, "session.cjs")
                    .env("DRAWIT_HOME", &config.home)
                    .env("DRAWIT_MANAGED_SESSION", "1")
                    .stdin(Stdio::piped())
                    .stdout(Stdio::null())
                    .stderr(stderr)
                    .spawn()
                    .map_err(|e| e.to_string())?,
            );
            return Err("绘图会话正在重新启动，请稍候".into());
        }
    }
    let text = std::fs::read_to_string(config.home.join("session.json"))
        .map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

#[tauri::command]
async fn drawit_confirm_action(app: tauri::AppHandle, message: String) -> Result<bool, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    if message.chars().count() > 500 {
        return Err("确认文字超过长度限制".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title("drawit")
            .buttons(MessageDialogButtons::OkCancelCustom(
                "确认".into(),
                "取消".into(),
            ))
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn drawit_mcp_config(config: tauri::State<'_, DesktopConfig>) -> serde_json::Value {
    config.mcp.clone()
}

#[tauri::command]
fn drawit_diagnostic(
    config: tauri::State<'_, DesktopConfig>,
    record: serde_json::Value,
) -> Result<(), String> {
    use std::io::Write;
    let path = config.home.join("ui.log");
    if std::fs::metadata(&path)
        .map(|m| m.len() > 5_000_000)
        .unwrap_or(false)
    {
        let _ = std::fs::rename(config.home.join("ui.log.1"), config.home.join("ui.log.2"));
        let _ = std::fs::rename(&path, config.home.join("ui.log.1"));
    }
    let mut clean = serde_json::Map::new();
    for key in [
        "at",
        "name",
        "stack",
        "componentStack",
        "documentId",
        "revision",
        "nodeId",
        "operations",
    ] {
        if let Some(value) = record.get(key) {
            if let Some(text) = value.as_str() {
                clean.insert(
                    key.to_string(),
                    serde_json::Value::String(text.chars().take(3000).collect()),
                );
            } else if value.is_u64() {
                clean.insert(key.to_string(), value.clone());
            } else if key == "operations" {
                if let Some(items) = value.as_array() {
                    clean.insert(
                        key.into(),
                        serde_json::json!(items
                            .iter()
                            .take(20)
                            .filter_map(|item| item.as_str())
                            .map(|text| text.chars().take(50).collect::<String>())
                            .collect::<Vec<_>>()),
                    );
                }
            }
        }
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{}", serde_json::Value::Object(clean)).map_err(|e| e.to_string())
}
