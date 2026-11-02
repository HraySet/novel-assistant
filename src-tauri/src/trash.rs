//! 回收站：删除不直接销毁，而是移入项目根的 `.trash/` 并记录原始位置。
//!
//! 元数据写在 `.trash/.meta.json`，`list_trash` 会过滤掉磁盘上已不存在的条目
//! （用户手动清理过回收站时自动愈合，不需要额外对账）。

use crate::backup::clear_backup_hash;
use crate::paths::{project_root_of, resolve_within};
use crate::types::TrashEntry;
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn delete_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    // 回收站根目录一律取后端 config，不信任前端传参；
    // 源路径过统一沙箱，杜绝把项目外文件搬进/搬出回收站
    let root = project_root_of(&app).ok_or_else(|| "尚未设置项目目录".to_string())?;
    let src = resolve_within(&root, &path)?;
    if !src.exists() {
        return Ok(());
    }
    if src == root {
        return Err("不能删除项目根目录".to_string());
    }
    // 移到项目根下的 .trash
    let filename = src.file_name().unwrap_or_default().to_string_lossy().to_string();
    let is_dir = src.is_dir();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let trash_dir = root.join(".trash");
    fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    let dest = trash_dir.join(format!("{}_{}", ts, filename));
    fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    // 清掉备份去重缓存：恢复或新建同名文件时能正常产生新备份
    clear_backup_hash(&src);

    // 记录元数据，回收站 UI 据此展示与恢复
    let mut meta = read_trash_meta(&root);
    meta.retain(|e| e.trash_path != dest.to_string_lossy());
    meta.push(TrashEntry {
        trash_path: dest.to_string_lossy().to_string(),
        original_path: src.to_string_lossy().to_string(),
        name: filename,
        is_dir,
        deleted_at: ts,
    });
    write_trash_meta(&root, &meta);

    Ok(())
}

fn read_trash_meta(project_root: &Path) -> Vec<TrashEntry> {
    let file = project_root.join(".trash").join(".meta.json");
    match fs::read_to_string(&file) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => vec![],
    }
}

fn write_trash_meta(project_root: &Path, entries: &[TrashEntry]) {
    let file = project_root.join(".trash").join(".meta.json");
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).ok();
    }
    if let Ok(json) = serde_json::to_string_pretty(entries) {
        fs::write(&file, json).ok();
    }
}

/// 列出回收站内容（按删除时间倒序）
#[tauri::command]
pub fn list_trash(app: tauri::AppHandle) -> Vec<TrashEntry> {
    let Some(root) = project_root_of(&app) else {
        return vec![];
    };
    let mut entries = read_trash_meta(&root);
    // 只保留文件仍在回收站里的记录（外部手动清理后自动消失）
    entries.retain(|e| Path::new(&e.trash_path).exists());
    entries.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    entries
}

/// 恢复：移回原位置，重名时自动加序号；返回实际恢复到的路径
#[tauri::command]
pub fn restore_trash(
    app: tauri::AppHandle,
    trash_path: String,
    original_path: String,
) -> Result<String, String> {
    let root = project_root_of(&app).ok_or_else(|| "尚未设置项目目录".to_string())?;
    let src = resolve_within(&root, &trash_path)?;
    if !src.exists() {
        return Err("回收站中的文件不存在".to_string());
    }
    let dest = resolve_within(&root, &original_path)?;
    let parent = dest.parent().unwrap_or(Path::new("."));
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let name = dest
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("restored");
    let final_dest = crate::paths::unique_path(parent, name);
    fs::rename(src, &final_dest).map_err(|e| e.to_string())?;
    Ok(final_dest.to_string_lossy().to_string())
}

/// 清空回收站
#[tauri::command]
pub fn empty_trash(app: tauri::AppHandle) -> Result<(), String> {
    let Some(root) = project_root_of(&app) else {
        return Ok(());
    };
    let dir = root.join(".trash");
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
