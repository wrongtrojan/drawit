use std::{path::PathBuf, process::{Child, Command, Stdio}, sync::Mutex};
use tauri::Manager;

struct SessionProcess(Mutex<Option<Child>>);
impl Drop for SessionProcess {
    fn drop(&mut self) {
        if let Some(mut child) = self.0.lock().unwrap().take() {
            drop(child.stdin.take());
            for _ in 0..40 {
                if child.try_wait().ok().flatten().is_some() { return; }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

struct DesktopConfig { home: PathBuf, mcp: serde_json::Value }

fn runtime_command(runtime: &std::path::Path, entry: &str) -> Command {
    let mut command = Command::new(runtime.join(if cfg!(windows) { "node.exe" } else { "node" }));
    command.arg(runtime.join(entry));
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    command
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--mcp") {
        let runtime = args.windows(2).find(|pair| pair[0] == "--runtime").map(|pair| PathBuf::from(&pair[1]));
        let Some(runtime) = runtime else { eprintln!("drawit --mcp requires --runtime from the copied MCP configuration"); std::process::exit(1); };
        match runtime_command(&runtime, "mcp.cjs").status() {
            Ok(status) => std::process::exit(status.code().unwrap_or(1)),
            Err(error) => { eprintln!("Cannot start drawit MCP: {error}"); std::process::exit(1); }
        }
    }
    tauri::Builder::default()
        .setup(|app| {
            let home = std::env::var("DRAWIT_HOME").map(PathBuf::from).unwrap_or(app.path().app_data_dir()?.with_file_name("drawit"));
            let runtime = app.path().resource_dir()?.join("runtime");
            let (child, command, arguments) = if cfg!(debug_assertions) {
                let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..").canonicalize()?;
                (None, "node".to_string(), vec![root.join("packages/mcp/node_modules/tsx/dist/cli.mjs").to_string_lossy().into_owned(), root.join("packages/mcp/src/index.ts").to_string_lossy().into_owned()])
            } else {
                let child = runtime_command(&runtime, "session.cjs")
                    .env("DRAWIT_HOME", &home).env("DRAWIT_MANAGED_SESSION", "1")
                    .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::inherit()).spawn()?;
                (Some(child), std::env::current_exe()?.to_string_lossy().into_owned(), vec!["--mcp".to_string(), "--runtime".to_string(), runtime.to_string_lossy().into_owned()])
            };
            app.manage(SessionProcess(Mutex::new(child)));
            app.manage(DesktopConfig { home: home.clone(), mcp: serde_json::json!({ "mcpServers": { "drawit": { "command": command, "args": arguments, "env": { "DRAWIT_HOME": home } } } }) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![drawit_session, drawit_mcp_config])
        .run(tauri::generate_context!())
        .expect("error while running drawit");
}

#[tauri::command]
fn drawit_session(config: tauri::State<'_, DesktopConfig>) -> Result<serde_json::Value, String> {
    let text = std::fs::read_to_string(config.home.join("session.json")).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

#[tauri::command]
fn drawit_mcp_config(config: tauri::State<'_, DesktopConfig>) -> serde_json::Value { config.mcp.clone() }
