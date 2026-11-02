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

/// 备份文件名格式 `{ts}_{filename}`，解析出时间戳与原始文件名。
///
/// 为什么不用 `name.ends_with(&format!("_{}", filename))`：
/// 文件名互为后缀时会串档——`章.md` 的备份后缀 `_章.md` 也匹配 `100_v2_章.md`，
/// 于是两个文件的备份列表会互相混入，prune 还可能误删别人的备份。
fn parse_backup_name(name: &str, filename: &str) -> Option<u64> {
    let (ts, rest) = name.split_once('_')?;
    if rest != filename {
        return None;
    }
    if ts.is_empty() || !ts.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    ts.parse::<u64>().ok()
}

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
    let mut backups: Vec<PathBuf> = Vec::new();
    for entry in fs::read_dir(backup_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if parse_backup_name(&name, filename).is_some() {
            backups.push(entry.path());
        }
    }
    if backups.len() <= MAX_BACKUPS_PER_FILE {
        return Ok(());
    }
    // 文件名格式 {ts}_{filename}，按时间戳升序，最旧的在前面
    backups.sort_by_key(|p| {
        let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
        parse_backup_name(&name, filename).unwrap_or(0)
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
    let old_name_str = old_name.to_string_lossy();
    let new_backup_dir = new_dir.join(".backups");
    let mut created = false;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if parse_backup_name(&name, &old_name_str).is_none() {
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
    let old_suffix_check = old_name.to_string_lossy().to_string();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(ts) = parse_backup_name(&name, &old_suffix_check) else {
            continue;
        };
        let new_backup = old_dir
            .join(".backups")
            .join(format!("{}_{}", ts, new_name.to_string_lossy()));
        let _ = fs::rename(entry.path(), new_backup);
    }
}

/// 删除某文件在 `.backups/` 里的全部历史备份（永久删除时用，失败不阻塞）。
///
/// 场景：文件被删进回收站后，它的备份仍留在原目录的 `.backups/` 里；用户若
/// 恢复，备份应该还在（能继续看历史），但「清空回收站」意味着永久删除——
/// 此时这些备份已无主，留着只会占用磁盘且永远无法从 UI 访问到。
pub fn purge_backups_for(path: &Path) {
    let (Some(dir), Some(name)) = (path.parent(), path.file_name()) else {
        return;
    };
    let backup_dir = dir.join(".backups");
    let Ok(entries) = fs::read_dir(&backup_dir) else {
        return;
    };
    let name_str = name.to_string_lossy();
    for entry in entries.flatten() {
        let fname = entry.file_name().to_string_lossy().to_string();
        if parse_backup_name(&fname, &name_str).is_some() {
            let _ = fs::remove_file(entry.path());
        }
    }
    // 目录清空后顺手移除（.backups 是隐藏目录，空着无意义）
    let _ = fs::remove_dir(&backup_dir);
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
    let mut backups: Vec<BackupEntry> = Vec::new();

    for entry in fs::read_dir(&backup_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(timestamp) = parse_backup_name(&name, &filename) {
            backups.push(BackupEntry {
                path: entry.path().to_string_lossy().to_string(),
                timestamp,
            });
        }
    }

    backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(backups)
}

#[cfg(test)]
mod tests {
    use super::{parse_backup_name, purge_backups_for};
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn parses_own_backup() {
        assert_eq!(
            parse_backup_name("1700000000_第1章.md", "第1章.md"),
            Some(1_700_000_000)
        );
    }

    #[test]
    fn does_not_mix_up_similar_filenames() {
        // 回归：旧实现用 ends_with("_章.md") 匹配，会把 v2_章.md 的备份算进 章.md
        assert_eq!(parse_backup_name("1700000000_v2_章.md", "章.md"), None);
        assert_eq!(
            parse_backup_name("1700000000_v2_章.md", "v2_章.md"),
            Some(1_700_000_000)
        );
    }

    #[test]
    fn handles_filename_containing_underscores() {
        assert_eq!(
            parse_backup_name("1700000000_我的_草稿.md", "我的_草稿.md"),
            Some(1_700_000_000)
        );
    }

    #[test]
    fn rejects_malformed_names() {
        assert_eq!(parse_backup_name("abc_第1章.md", "第1章.md"), None, "时间戳必须是数字");
        assert_eq!(parse_backup_name("第1章.md", "第1章.md"), None, "缺时间戳前缀");
        assert_eq!(parse_backup_name("_第1章.md", "第1章.md"), None, "空时间戳");
        assert_eq!(parse_backup_name("1700000000_别的.md", "第1章.md"), None, "别人的备份");
    }

    #[test]
    fn purge_removes_only_own_backups() {
        let tmp = std::env::temp_dir().join(format!("qb-backup-test-{}", std::process::id()));
        let dir = tmp.join("卷1");
        let backup_dir = dir.join(".backups");
        fs::create_dir_all(&backup_dir).unwrap();

        let own1 = backup_dir.join("1700000000_第1章.md");
        let own2 = backup_dir.join("1700000001_第1章.md");
        let other = backup_dir.join("1700000002_第2章.md");
        fs::write(&own1, "v1").unwrap();
        fs::write(&own2, "v2").unwrap();
        fs::write(&other, "别人的").unwrap();

        let target = PathBuf::from(&dir).join("第1章.md");
        purge_backups_for(&target);

        assert!(!own1.exists(), "自己的备份应被清除");
        assert!(!own2.exists(), "自己的备份应被清除");
        assert!(other.exists(), "别人的备份不能误删");
        // 目录里还留着别人的备份 → 目录保留（只有清空后才移除）
        assert!(backup_dir.exists(), "目录里还有别人的备份，不应被移除");

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn purge_handles_missing_backup_dir() {
        let tmp = std::env::temp_dir().join(format!("qb-backup-none-{}", std::process::id()));
        let dir = tmp.join("卷1");
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("第1章.md");
        purge_backups_for(&target); // 不应 panic
        let _ = fs::remove_dir_all(&tmp);
    }
}
