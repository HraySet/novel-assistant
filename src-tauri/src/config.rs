//! 应用配置（config.json）与项目索引的读写。
//!
//! config.json 位于系统应用数据目录，结构：
//! ```json
//! { "project_path": "...", "project_index": [...], "ai": { ... } }
//! ```
//! 注意：`project_path` 是**全局单值**——所有文件命令都以它为沙箱根。
//! 这也是「同一时刻只能打开一个项目」的根源；多窗口场景需要改成按窗口区分。

use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

pub fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).ok();
    Ok(dir.join("config.json"))
}

pub fn read_config(app: &tauri::AppHandle) -> Result<Value, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn write_config(app: &tauri::AppHandle, config: &Value) -> Result<(), String> {
    let path = config_path(app)?;
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// ── 当前项目 ──

#[tauri::command]
pub fn get_project_path(app: tauri::AppHandle) -> Result<String, String> {
    let config = read_config(&app)?;
    Ok(config["project_path"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
pub fn set_project_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let mut config = read_config(&app)?;
    config["project_path"] = Value::String(path);
    write_config(&app, &config)
}

// ── 项目索引（项目库列表） ──

#[tauri::command]
pub fn get_project_index(app: tauri::AppHandle) -> Result<Value, String> {
    let config = read_config(&app)?;
    Ok(config.get("project_index").cloned().unwrap_or(serde_json::json!([])))
}

#[tauri::command]
pub fn save_project_index(app: tauri::AppHandle, index: Value) -> Result<(), String> {
    let mut config = read_config(&app)?;
    config["project_index"] = index;
    write_config(&app, &config)
}
