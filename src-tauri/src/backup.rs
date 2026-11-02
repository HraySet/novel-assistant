//! 版本备份：每次写盘前把旧内容复制进同目录的 `.backups/`。
//!
//! 两条不变量：
//! 1. **先备份再覆盖**——顺序写反就等于没有备份；
//! 2. **内容未变不重复备份**——用 FNV-1a 哈希去重，避免 Ctrl+S 连按把备份份数刷爆。
//!
//! 文件名格式 `{unix_ts}_{原文件名}`，同名单文件最多保留 [`MAX_BACKUPS_PER_FILE`] 份。
//! 重命名/移动文件时要把已有备份一并改名/搬迁，否则历史版本会「失联」。

use crate::paths::{has_hidden_component, resolve_in_project};
use crate::types::BackupEntry;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// 同名文件在备份目录里最多保留的备份份数
const MAX_BACKUPS_PER_FILE: usize = 20;

/// 上次备份内容的 FNV-1a 哈希（路径 → 哈希）。
/// 新内容与上次备份一致时跳过备份，避免每次保存都整篇拷贝的写入放大
static BACKUP_HASH_CACHE: std::sync::LazyLock<Mutex<HashMap<PathBuf, u64>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// FNV-1a 64 位哈希：跨运行稳定，仅用于内容去重比较
fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// 清掉某个路径的备份去重缓存（删除/重命名/移动后调用，避免旧哈希抑制新备份）
pub fn clear_backup_hash(path: &Path) {
    if let Ok(mut cache) = BACKUP_HASH_CACHE.lock() {
        cache.remove(path);
    }
}

/// 写盘前备份旧内容（目标不存在则跳过；元数据目录不备份）
pub fn backup_file(filepath: &Path, new_content: &[u8]) -> Result<(), String> {
    if !filepath.exists() {
        return Ok(());
    }
    // 元数据目录（统计、聊天记录等）无需备份，避免堆积
    if has_hidden_component(filepath) {
        return Ok(());
    }

    // 新内容与上次备份一致（Ctrl+S 连按、撤销回原样等）→ 跳过备份。
    // 锁失败时跳过去重直接备份，不让非关键路径阻塞保存
    let new_hash = fnv1a64(new_content);
    if let Ok(mut cache) = BACKUP_HASH_CACHE.lock() {
        if cache.get(filepath) == Some(&new_hash) {
            return Ok(());
        }
        cache.insert(filepath.to_path_buf(), new_hash);
    }

    let parent = filepath.parent().unwrap_or(Path::new("."));
    let backup_dir = parent.join(".backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let filename = filepath.file_name().unwrap_or_default().to_string_lossy().to_string();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup_path = backup_dir.join(format!("{}_{}", ts, filename));
    fs::copy(filepath, &backup_path).map_err(|e| e.to_string())?;

    prune_backups(&backup_dir, &filename)?;
    Ok(())
}

/// 清理旧备份：同名文件只保留最近 MAX_BACKUPS_PER_FILE 份，超出部分删除
fn prune_backups(backup_dir: &Path, filename: &str) -> Result<(), String> {
    let suffix = format!("_{}", filename);
    let mut backups: Vec<PathBuf> = Vec::new();
    for entry in fs::read_dir(backup_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(&suffix) {
            backups.push(entry.path());
        }
    }
    if backups.len() <= MAX_BACKUPS_PER_FILE {
        return Ok(());
    }
    // 文件名格式 {ts}_{filename}，按时间戳升序，最旧的在前面
    backups.sort_by_key(|p| {
        let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
        name.split('_').next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0)
    });
    let remove_count = backups.len() - MAX_BACKUPS_PER_FILE;
    for old in backups.iter().take(remove_count) {
        fs::remove_file(old).ok();
    }
    Ok(())
}

/// 移动文件后，把源目录 .backups 中该文件的历史备份搬进目标目录（失败不阻塞）
pub fn migrate_backups_on_move(old_path: &Path, new_path: &Path) {
    let (Some(old_dir), Some(new_dir)) = (old_path.parent(), new_path.parent()) else {
        return;
    };
    if old_dir == new_dir {
        return;
    }
    let Some(old_name) = old_path.file_name() else {
        return;
    };
    let Ok(entries) = fs::read_dir(old_dir.join(".backups")) else {
        return;
    };
    let suffix = format!("_{}", old_name.to_string_lossy());
    let new_backup_dir = new_dir.join(".backups");
    let mut created = false;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(&suffix) {
            continue;
        }
        if !created {
            let _ = fs::create_dir_all(&new_backup_dir);
            created = true;
        }
        let _ = fs::rename(entry.path(), new_backup_dir.join(&name));
    }
}

/// 同目录下把 {ts}_{旧名} 备份改成 {ts}_{新名}（失败不影响主流程）
pub fn migrate_backups_on_rename(old_path: &Path, new_path: &Path) {
    let (Some(old_dir), Some(new_dir)) = (old_path.parent(), new_path.parent()) else {
        return;
    };
    if old_dir != new_dir {
        return;
    }
    let (Some(old_name), Some(new_name)) = (old_path.file_name(), new_path.file_name()) else {
        return;
    };
    let Ok(entries) = fs::read_dir(old_dir.join(".backups")) else {
        return;
    };
    let suffix_old = format!("_{}", old_name.to_string_lossy());
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(&suffix_old) {
            continue;
        }
        let ts = name.split('_').next().unwrap_or("");
        let new_backup = old_dir
            .join(".backups")
            .join(format!("{}_{}", ts, new_name.to_string_lossy()));
        let _ = fs::rename(entry.path(), new_backup);
    }
}

/// 列出指定文件的备份历史（按时间倒序，最新在前）
#[tauri::command]
pub fn list_backups(app: tauri::AppHandle, file_path: String) -> Result<Vec<BackupEntry>, String> {
    let path = resolve_in_project(&app, &file_path)?;
    let parent = path.parent().unwrap_or(Path::new("."));
    let backup_dir = parent.join(".backups");
    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let suffix = format!("_{}", filename);
    let mut backups: Vec<BackupEntry> = Vec::new();

    for entry in fs::read_dir(&backup_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(&suffix) {
            let timestamp = name.split('_').next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            backups.push(BackupEntry {
                path: entry.path().to_string_lossy().to_string(),
                timestamp,
            });
        }
    }

    backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(backups)
}
