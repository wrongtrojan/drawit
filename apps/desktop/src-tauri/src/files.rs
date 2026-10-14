//! Native-only directory capabilities. Session/MCP never receive an external path.
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use uuid::Uuid;

const MAX_BYTES: usize = 32 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
struct Directory {
    path: PathBuf,
    identity: String,
}
#[derive(Clone, Serialize, Deserialize)]
struct Target {
    directory: Directory,
    fingerprint: Option<String>,
}
#[derive(Default, Serialize, Deserialize)]
struct Settings {
    saves: HashMap<String, Target>,
    last_export: Option<PathBuf>,
}
#[derive(Clone)]
struct Grant {
    document_id: String,
    format: String,
    directory: Directory,
    previous: Option<String>,
}
pub struct FileBroker {
    home: PathBuf,
    state: Mutex<State>,
}
struct State {
    settings: Settings,
    grants: HashMap<String, Grant>,
}
#[derive(Serialize)]
pub struct DirectoryChoice {
    handle: String,
    path: String,
}
#[derive(Serialize)]
pub struct WriteReceipt {
    path: String,
    revision: u64,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 81
        && id.as_bytes()[0].is_ascii_alphanumeric()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn file_name(id: &str, format: &str) -> Result<String, String> {
    if !valid_id(id) || !["document", "svg", "png"].contains(&format) {
        return Err("Invalid document or artifact kind".into());
    }
    Ok(format!(
        "{id}.{}",
        if format == "document" {
            "drawit.json"
        } else {
            format
        }
    ))
}
fn directory(path: &Path) -> Result<Directory, String> {
    let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_dir() {
        return Err("The selected path is not a directory".into());
    }
    #[cfg(unix)]
    let identity = {
        use std::os::unix::fs::MetadataExt;
        format!("{}:{}", meta.dev(), meta.ino())
    };
    #[cfg(not(unix))]
    let identity = format!("{:?}", meta.created().map_err(|e| e.to_string())?);
    Ok(Directory { path, identity })
}
fn verify_directory(value: &Directory) -> Result<(), String> {
    if &directory(&value.path)? != value {
        return Err("The selected directory changed; choose it again".into());
    }
    Ok(())
}
fn regular(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err("Reparse points are forbidden".into());
                }
            }
            if meta.file_type().is_symlink() || !meta.is_file() {
                return Err("Target must be a regular file".into());
            }
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
fn fingerprint(path: &Path) -> Result<Option<String>, String> {
    use std::hash::{Hash, Hasher};
    regular(path)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = read_regular(path)?;
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    bytes.hash(&mut hash);
    Ok(Some(format!("{:x}:{}", hash.finish(), bytes.len())))
}
fn read_regular(path: &Path) -> Result<Vec<u8>, String> {
    regular(path)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    let file = options.open(path).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err("Reparse points are forbidden".into());
        }
    }
    if !meta.is_file() || meta.len() > MAX_BYTES as u64 {
        return Err("File exceeds size budget or is not regular".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("File exceeds size budget".into());
    }
    Ok(bytes)
}

/// On Unix, all writes and renames use a held directory descriptor, so swapping
/// a selected directory cannot redirect writes through another path.
#[cfg(unix)]
fn atomic_write(dir: &Directory, name: &str, bytes: &[u8]) -> Result<(), String> {
    use std::{
        ffi::CString,
        os::fd::{AsRawFd, FromRawFd},
    };
    verify_directory(dir)?;
    let parent = File::open(&dir.path).map_err(|e| e.to_string())?;
    {
        use std::os::unix::fs::MetadataExt;
        let m = parent.metadata().map_err(|e| e.to_string())?;
        if format!("{}:{}", m.dev(), m.ino()) != dir.identity {
            return Err("Directory identity changed".into());
        }
    }
    let name = CString::new(name).map_err(|e| e.to_string())?;
    let temporary = CString::new(format!(".drawit-{}.tmp", Uuid::new_v4())).unwrap();
    let backup = CString::new(format!(".drawit-{}.bak", Uuid::new_v4())).unwrap();
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            temporary.as_ptr(),
            libc::O_CREAT | libc::O_EXCL | libc::O_WRONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            0o600,
        )
    };
    if fd < 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let mut file = unsafe { File::from_raw_fd(fd) };
    if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
        unsafe {
            libc::unlinkat(parent.as_raw_fd(), temporary.as_ptr(), 0);
        }
        return Err(error.to_string());
    }
    drop(file);
    let moved = unsafe {
        libc::renameat(
            parent.as_raw_fd(),
            name.as_ptr(),
            parent.as_raw_fd(),
            backup.as_ptr(),
        )
    };
    if moved < 0 && std::io::Error::last_os_error().kind() != std::io::ErrorKind::NotFound {
        unsafe {
            libc::unlinkat(parent.as_raw_fd(), temporary.as_ptr(), 0);
        }
        return Err(std::io::Error::last_os_error().to_string());
    }
    if unsafe {
        libc::renameat(
            parent.as_raw_fd(),
            temporary.as_ptr(),
            parent.as_raw_fd(),
            name.as_ptr(),
        )
    } < 0
    {
        let error = std::io::Error::last_os_error().to_string();
        if moved == 0 {
            unsafe {
                libc::renameat(
                    parent.as_raw_fd(),
                    backup.as_ptr(),
                    parent.as_raw_fd(),
                    name.as_ptr(),
                );
            }
        }
        unsafe {
            libc::unlinkat(parent.as_raw_fd(), temporary.as_ptr(), 0);
        }
        return Err(error);
    }
    unsafe {
        libc::unlinkat(parent.as_raw_fd(), backup.as_ptr(), 0);
    }
    parent.sync_all().map_err(|e| e.to_string())
}
#[cfg(not(unix))]
fn atomic_write(dir: &Directory, name: &str, bytes: &[u8]) -> Result<(), String> {
    verify_directory(dir)?;
    let path = dir.path.join(name);
    regular(&path)?;
    let temporary = dir.path.join(format!(".drawit-{}.tmp", Uuid::new_v4()));
    let backup = dir.path.join(format!(".drawit-{}.bak", Uuid::new_v4()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    drop(file);
    verify_directory(dir)?;
    let moved = if path.exists() {
        fs::rename(&path, &backup).map_err(|e| e.to_string())?;
        true
    } else {
        false
    };
    if let Err(error) = fs::rename(&temporary, &path) {
        if moved {
            let _ = fs::rename(&backup, &path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    if moved {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

impl FileBroker {
    pub fn new(home: PathBuf) -> Self {
        let settings = fs::read(home.join("desktop-targets.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            home,
            state: Mutex::new(State {
                settings,
                grants: HashMap::new(),
            }),
        }
    }
    fn grant(&self, id: &str, format: &str, value: Directory) -> Result<DirectoryChoice, String> {
        let name = file_name(id, format)?;
        verify_directory(&value)?;
        regular(&value.path.join(name))?;
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        let previous = state
            .settings
            .saves
            .get(id)
            .filter(|target| target.directory == value && format == "document")
            .and_then(|target| target.fingerprint.clone());
        let handle = Uuid::new_v4().to_string();
        if state.grants.len() >= 32 {
            state.grants.clear();
        }
        state.grants.insert(
            handle.clone(),
            Grant {
                document_id: id.into(),
                format: format.into(),
                directory: value.clone(),
                previous,
            },
        );
        Ok(DirectoryChoice {
            handle,
            path: value.path.to_string_lossy().into(),
        })
    }
    fn take(&self, handle: &str, id: &str, format: &str) -> Result<Grant, String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        let grant = state
            .grants
            .get(handle)
            .ok_or("Unknown or consumed directory handle")?;
        if grant.document_id != id || grant.format != format {
            return Err("Directory handle belongs to another artifact".into());
        }
        verify_directory(&grant.directory)?;
        Ok(state.grants.remove(handle).unwrap())
    }
    fn remember(&self, grant: &Grant, signature: Option<String>) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        if grant.format == "document" {
            state.settings.saves.insert(
                grant.document_id.clone(),
                Target {
                    directory: grant.directory.clone(),
                    fingerprint: signature,
                },
            );
        } else {
            state.settings.last_export = Some(grant.directory.path.clone());
        }
        fs::create_dir_all(&self.home).map_err(|e| e.to_string())?;
        let own = directory(&self.home)?;
        atomic_write(
            &own,
            "desktop-targets.json",
            &serde_json::to_vec(&state.settings).map_err(|e| e.to_string())?,
        )
    }
}

#[tauri::command]
pub async fn drawit_choose_directory(
    app: AppHandle,
    document_id: String,
    format: String,
    force: bool,
) -> Result<Option<DirectoryChoice>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        file_name(&document_id, &format)?;
        let broker = app.state::<FileBroker>();
        let remembered = {
            let state = broker.state.lock().map_err(|e| e.to_string())?;
            state.settings.saves.get(&document_id).cloned()
        };
        if format == "document" && !force {
            if let Some(target) = &remembered {
                if verify_directory(&target.directory).is_ok() {
                    return broker
                        .grant(&document_id, &format, target.directory.clone())
                        .map(Some);
                }
            }
        }
        let mut dialog = app.dialog().file().set_title(if format == "document" {
            "选择工程保存目录"
        } else {
            "选择导出目录"
        });
        let initial = if format == "document" {
            remembered.map(|value| value.directory.path)
        } else {
            broker
                .state
                .lock()
                .map_err(|e| e.to_string())?
                .settings
                .last_export
                .clone()
        };
        if let Some(path) = initial {
            if path.is_dir() {
                dialog = dialog.set_directory(path);
            }
        }
        let Some(path) = dialog.blocking_pick_folder() else {
            return Ok(None);
        };
        broker
            .grant(
                &document_id,
                &format,
                directory(&path.into_path().map_err(|e| e.to_string())?)?,
            )
            .map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn drawit_write_artifact(
    app: AppHandle,
    handle: String,
    document_id: String,
    revision: u64,
    format: String,
    payload: String,
) -> Result<Option<WriteReceipt>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if payload.len() > MAX_BYTES {
            return Err("Artifact exceeds size budget".into());
        }
        let broker = app.state::<FileBroker>();
        let grant = broker.take(&handle, &document_id, &format)?;
        let name = file_name(&document_id, &format)?;
        let path = grant.directory.path.join(&name);
        let bytes = if format == "png" {
            base64::engine::general_purpose::STANDARD
                .decode(&payload)
                .map_err(|e| e.to_string())?
        } else {
            payload.into_bytes()
        };
        if format == "document" {
            let json: serde_json::Value =
                serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            if json.get("documentId").and_then(|v| v.as_str()) != Some(&document_id)
                || json.get("revision").and_then(|v| v.as_u64()) != Some(revision)
            {
                return Err("Snapshot identity or revision changed".into());
            }
        }
        if format == "png" && !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err("Invalid PNG artifact".into());
        }
        let current = fingerprint(&path)?;
        if current.is_some() && (grant.previous.is_none() || current != grant.previous) {
            if !app
                .dialog()
                .message(format!(
                    "目标文件已存在或被外部修改，是否覆盖？\n{}",
                    path.display()
                ))
                .buttons(MessageDialogButtons::OkCancel)
                .blocking_show()
            {
                return Ok(None);
            }
        }
        if fingerprint(&path)? != current {
            return Err("File changed during confirmation; save again".into());
        }
        atomic_write(&grant.directory, &name, &bytes)?;
        broker.remember(&grant, fingerprint(&path)?)?;
        Ok(Some(WriteReceipt {
            path: path.to_string_lossy().into(),
            revision,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn drawit_external_file(
    app: AppHandle,
    document_id: String,
    read: bool,
    ack: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        file_name(&document_id, "document")?;
        let broker = app.state::<FileBroker>(); let target = broker.state.lock().map_err(|e| e.to_string())?.settings.saves.get(&document_id).cloned();
        let Some(target) = target else { return Ok(serde_json::json!({ "changed": false })); };
        verify_directory(&target.directory)?; let path = target.directory.path.join(file_name(&document_id, "document")?);
        let current = fingerprint(&path)?;
        if let Some(ack) = ack { if current.as_deref() != Some(&ack) { return Err("External file changed during reload".into()); } let grant = Grant { document_id: document_id.clone(), format: "document".into(), directory: target.directory.clone(), previous: target.fingerprint.clone() }; broker.remember(&grant, current.clone())?; }
        if read { if current.is_none() { return Err("Saved file no longer exists".into()); } let payload = String::from_utf8(read_regular(&path)?).map_err(|e| e.to_string())?; if fingerprint(&path)? != current { return Err("External file changed during read".into()); } Ok(serde_json::json!({ "payload": payload, "path": path, "fingerprint": current, "changed": current != target.fingerprint })) }
        else { Ok(serde_json::json!({ "path": path, "changed": current != target.fingerprint })) }
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (PathBuf, FileBroker) {
        let root = std::env::temp_dir().join(format!("drawit-native-{}", Uuid::new_v4()));
        fs::create_dir_all(root.join("用户 目录")).unwrap();
        let broker = FileBroker::new(root.clone());
        (root, broker)
    }
    #[test]
    fn handles_are_bound_and_one_use() {
        let (root, broker) = fixture();
        let choice = broker
            .grant("a", "document", directory(&root.join("用户 目录")).unwrap())
            .unwrap();
        assert!(broker.take(&choice.handle, "b", "document").is_err());
        assert!(broker.take(&choice.handle, "a", "png").is_err());
        assert!(broker.take(&choice.handle, "a", "document").is_ok());
        assert!(broker.take(&choice.handle, "a", "document").is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn writes_unicode_directory_and_remembers_target_after_restart() {
        let (root, broker) = fixture();
        let choice = broker
            .grant("a", "document", directory(&root.join("用户 目录")).unwrap())
            .unwrap();
        let grant = broker.take(&choice.handle, "a", "document").unwrap();
        atomic_write(&grant.directory, "a.drawit.json", b"original").unwrap();
        atomic_write(&grant.directory, "a.drawit.json", b"updated").unwrap();
        broker
            .remember(
                &grant,
                fingerprint(&grant.directory.path.join("a.drawit.json")).unwrap(),
            )
            .unwrap();
        assert_eq!(
            fs::read(grant.directory.path.join("a.drawit.json")).unwrap(),
            b"updated"
        );
        let reopened = FileBroker::new(root.clone());
        assert!(reopened
            .state
            .lock()
            .unwrap()
            .settings
            .saves
            .contains_key("a"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn changed_directory_and_linked_target_are_rejected() {
        let (root, broker) = fixture();
        let selected = root.join("用户 目录");
        let choice = broker
            .grant("a", "document", directory(&selected).unwrap())
            .unwrap();
        fs::rename(&selected, root.join("old")).unwrap();
        fs::create_dir(&selected).unwrap();
        assert!(broker.take(&choice.handle, "a", "document").is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.join("old"), selected.join("a.drawit.json")).unwrap();
            assert!(broker
                .grant("a", "document", directory(&selected).unwrap())
                .is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }
}
