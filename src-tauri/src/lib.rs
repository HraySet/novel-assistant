use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use time::OffsetDateTime;

// ── Directory constants ──

#[allow(dead_code)]
mod dirs {
    pub const CHAPTERS: &str = "章节";
    pub const OUTLINE: &str = "大纲";
    pub const CHARACTERS: &str = "角色";
    pub const SETTINGS: &str = "设定";
    pub const CHAT: &str = "聊天";
    pub const SNAPSHOTS: &str = "快照";
}

// ── Types ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceStatus {
    pub initialized: bool,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookConfig {
    pub title: String,
    pub description: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileInfo {
    pub filename: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WorkspaceIndex {
    books: Vec<BookInfo>,
}

// ── Helpers ──

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).ok();
    Ok(dir.join("config.json"))
}

fn get_workspace_dir(app: &tauri::AppHandle) -> Result<String, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Err("WORKSPACE_NOT_INITIALIZED".into());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let ws = config["workspace_path"].as_str().unwrap_or("");
    if ws.is_empty() {
        return Err("WORKSPACE_NOT_INITIALIZED".into());
    }
    Ok(ws.to_string())
}

fn book_dir(app: &tauri::AppHandle, book_id: &str) -> Result<PathBuf, String> {
    let ws = get_workspace_dir(app)?;
    Ok(PathBuf::from(&ws).join(book_id))
}

fn read_workspace_index(app: &tauri::AppHandle) -> Result<WorkspaceIndex, String> {
    let ws = get_workspace_dir(app)?;
    let idx_path = PathBuf::from(&ws).join("workspace.json");
    if idx_path.exists() {
        let content = fs::read_to_string(&idx_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(WorkspaceIndex { books: vec![] })
    }
}

fn write_workspace_index(app: &tauri::AppHandle, index: &WorkspaceIndex) -> Result<(), String> {
    let ws = get_workspace_dir(app)?;
    let idx_path = PathBuf::from(&ws).join("workspace.json");
    let json = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    fs::write(&idx_path, json).map_err(|e| e.to_string())
}

fn gen_book_id(_title: &str) -> String {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("book_{}", ms)
}

fn now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| String::from("1970-01-01T00:00:00Z"))
}

// ── Commands ──

#[tauri::command]
fn get_workspace_status(app: tauri::AppHandle) -> WorkspaceStatus {
    match get_workspace_dir(&app) {
        Ok(path) => WorkspaceStatus { initialized: true, path },
        Err(_) => WorkspaceStatus { initialized: false, path: String::new() },
    }
}

#[tauri::command]
fn init_workspace(app: tauri::AppHandle, path: String) -> Result<WorkspaceStatus, String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let idx_path = PathBuf::from(&path).join("workspace.json");
    if !idx_path.exists() {
        let index = WorkspaceIndex { books: vec![] };
        let json = serde_json::to_string_pretty(&index).map_err(|e| e.to_string())?;
        fs::write(&idx_path, json).map_err(|e| e.to_string())?;
    }
    let cfg_path = config_path(&app)?;
    let config = serde_json::json!({"workspace_path": &path});
    fs::write(&cfg_path, serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(WorkspaceStatus { initialized: true, path })
}

#[tauri::command]
fn list_books(app: tauri::AppHandle) -> Result<Vec<BookInfo>, String> {
    read_workspace_index(&app).map(|i| i.books)
}

#[tauri::command]
fn create_book(app: tauri::AppHandle, title: String, description: String) -> Result<BookInfo, String> {
    let book_id = gen_book_id(&title);
    let now = now_iso();
    let dir = book_dir(&app, &book_id)?;
    fs::create_dir_all(dir.join(dirs::CHAPTERS)).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join(dirs::OUTLINE)).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join(dirs::CHARACTERS)).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join(dirs::SETTINGS)).map_err(|e| e.to_string())?;
    let config = BookConfig { title: title.clone(), description: description.clone(), created_at: now.clone() };
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(dir.join("book.json"), json).map_err(|e| e.to_string())?;
    let stats = serde_json::json!({"records":[],"snapshots":{},"goal":4000});
    fs::write(dir.join("stats.json"), serde_json::to_string_pretty(&stats).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::write(dir.join(dirs::OUTLINE).join("outline.md"), "# 大纲\n\n").map_err(|e| e.to_string())?;
    let mut index = read_workspace_index(&app)?;
    let book = BookInfo { id: book_id, title, description, created_at: now };
    index.books.push(book.clone());
    write_workspace_index(&app, &index)?;
    Ok(book)
}

#[tauri::command]
fn delete_book(app: tauri::AppHandle, book_id: String) -> Result<(), String> {
    let dir = book_dir(&app, &book_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let mut index = read_workspace_index(&app)?;
    index.books.retain(|b| b.id != book_id);
    write_workspace_index(&app, &index)
}

#[tauri::command]
fn get_book_config(app: tauri::AppHandle, book_id: String) -> Result<BookConfig, String> {
    let content = fs::read_to_string(book_dir(&app, &book_id)?.join("book.json"))
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_book_config(app: tauri::AppHandle, book_id: String, title: String, description: String) -> Result<(), String> {
    let dir = book_dir(&app, &book_id)?;
    let mut config: BookConfig =
        serde_json::from_str(&fs::read_to_string(dir.join("book.json")).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    config.title = title.clone();
    config.description = description.clone();
    fs::write(dir.join("book.json"), serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let mut index = read_workspace_index(&app)?;
    if let Some(b) = index.books.iter_mut().find(|b| b.id == book_id) {
        b.title = title;
        b.description = description;
    }
    write_workspace_index(&app, &index)
}

#[tauri::command]
fn list_book_files(app: tauri::AppHandle, book_id: String, subdir: String) -> Result<Vec<FileInfo>, String> {
    let target = if subdir.is_empty() { book_dir(&app, &book_id)? } else { book_dir(&app, &book_id)?.join(&subdir) };
    if !target.exists() { return Ok(vec![]); }
    let mut files: Vec<FileInfo> = vec![];
    for entry in fs::read_dir(&target).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() { continue; }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_default();
        files.push(FileInfo {
            filename: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
            size_bytes: meta.len(),
            modified_at: modified,
        });
    }
    if subdir == dirs::CHAPTERS { files.sort_by(|a, b| a.filename.cmp(&b.filename)); }
    else { files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at)); }
    Ok(files)
}

#[tauri::command]
fn read_book_file(app: tauri::AppHandle, book_id: String, subdir: String, filename: String) -> Result<String, String> {
    let dir = book_dir(&app, &book_id)?;
    let filepath = if subdir.is_empty() { dir.join(&filename) } else { dir.join(&subdir).join(&filename) };
    fs::read_to_string(&filepath).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_book_file(app: tauri::AppHandle, book_id: String, subdir: String, filename: String, content: String) -> Result<(), String> {
    let dir = book_dir(&app, &book_id)?;
    let filepath = if subdir.is_empty() { dir.join(&filename) } else {
        let sub = dir.join(&subdir);
        fs::create_dir_all(&sub).map_err(|e| e.to_string())?;
        sub.join(&filename)
    };
    if filepath.exists() {
        let backup_dir = dir.join(".backups");
        fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        fs::copy(&filepath, backup_dir.join(format!("{}_{}", ts, filename))).map_err(|e| e.to_string())?;
    }
    fs::write(&filepath, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_book_file(app: tauri::AppHandle, book_id: String, subdir: String, filename: String) -> Result<(), String> {
    let dir = book_dir(&app, &book_id)?;
    let filepath = if subdir.is_empty() { dir.join(&filename) } else { dir.join(&subdir).join(&filename) };
    if filepath.exists() {
        let backup_dir = dir.join(".backups");
        fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        fs::rename(&filepath, backup_dir.join(format!("{}_{}_deleted", ts, filename)))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── AI config (stored in app data dir, not localStorage) ──

#[tauri::command]
fn get_ai_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(config.get("ai").cloned().unwrap_or(serde_json::json!({})))
}

#[tauri::command]
fn save_ai_config(app: tauri::AppHandle, ai_config: serde_json::Value) -> Result<(), String> {
    let path = config_path(&app)?;
    let mut config: serde_json::Value = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    } else {
        serde_json::json!({})
    };
    config["ai"] = ai_config;
    fs::write(&path, serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

// ── Entry ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_workspace_status,
            init_workspace,
            list_books,
            create_book,
            delete_book,
            get_book_config,
            update_book_config,
            list_book_files,
            read_book_file,
            write_book_file,
            delete_book_file,
            get_ai_config,
            save_ai_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
