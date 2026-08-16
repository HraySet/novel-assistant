use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

use serde::{Deserialize, Serialize};

use std::collections::HashMap;

use std::fs;

use std::path::{Path, PathBuf};

use std::sync::Mutex;

use tauri::Manager;

#[cfg(windows)]
mod native_drag;



// ── Types ──

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<DirEntry>>,
    /// 字数（仅文件，目录不返回此字段）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub path: String,
    pub timestamp: u64,
}

/// 回收站条目（元数据记录在 .trash/.meta.json）
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    pub trash_path: String,
    pub original_path: String,
    pub name: String,
    pub is_dir: bool,
    pub deleted_at: u64,
}

/// 外部拖入的文件：相对路径 + base64 内容
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    pub rel_path: String,
    pub base64_data: String,
}

// ── Helpers ──

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).ok();
    Ok(dir.join("config.json"))
}

fn read_config(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_config(app: &tauri::AppHandle, config: &serde_json::Value) -> Result<(), String> {
    let path = config_path(app)?;
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// 项目根目录（来自后端 config，已规范化解析符号链接）；未设置/不可用时返回 None
fn project_root_of(app: &tauri::AppHandle) -> Option<PathBuf> {
    let config = read_config(app).ok()?;
    let root = PathBuf::from(config["project_path"].as_str()?);
    if root.as_os_str().is_empty() {
        return None;
    }
    root.canonicalize().ok()
}

/// 统一路径沙箱：把前端传入的路径约束在项目根目录内。
/// - 相对路径先拼到 root、绝对路径原样使用，再规范化（解析符号链接）；
/// - 目标不存在（新建文件/目录）时回溯到最近存在的父目录做规范化校验后拼回剩余部分；
/// - 返回规范化后的绝对路径；路径越界或解析失败一律 Err（fail closed）。
fn resolve_within(root: &Path, path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("路径为空".to_string());
    }
    let p = Path::new(trimmed);
    let joined = if p.is_absolute() { p.to_path_buf() } else { root.join(p) };

    if joined.exists() {
        let canonical = joined.canonicalize().map_err(|e| format!("路径解析失败: {e}"))?;
        if canonical.starts_with(root) {
            return Ok(canonical);
        }
        return Err(format!("路径超出项目目录: {path}"));
    }

    // 目标不存在：回溯到最近存在的父目录，规范化校验后拼回剩余组件
    let mut existing = joined.as_path();
    let mut suffix: Vec<std::ffi::OsString> = Vec::new();
    while !existing.exists() {
        let name = existing.file_name().ok_or_else(|| format!("无效路径: {path}"))?;
        suffix.push(name.to_os_string());
        existing = existing.parent().ok_or_else(|| format!("无效路径: {path}"))?;
    }
    let canonical_parent = existing.canonicalize().map_err(|e| format!("路径解析失败: {e}"))?;
    if !canonical_parent.starts_with(root) {
        return Err(format!("路径超出项目目录: {path}"));
    }
    let mut out = canonical_parent;
    for seg in suffix.iter().rev() {
        out = out.join(seg);
    }
    Ok(out)
}

/// 便捷组合：取项目根并沙箱解析；项目未设置时返回错误
fn resolve_in_project(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let root = project_root_of(app).ok_or_else(|| "尚未设置项目目录".to_string())?;
    resolve_within(&root, path)
}

/// 排除隐藏文件、备份和回收站目录
fn should_skip(name: &str) -> bool {
    name.starts_with('.') || name == ".backups" || name == ".trash" || name == ".chatlog"
}

/// 统计中英文混排文本的字数：每个 CJK 字符计为 1 字，英文按空格分词计数
fn count_words(text: &str) -> usize {
    let mut count = 0;
    let mut in_word = false;

    for ch in text.chars() {
        
        let is_cjk = matches!(ch,
            '\u{4E00}'..='\u{9FFF}'   // CJK 统一表意文字
            | '\u{3400}'..='\u{4DBF}' // CJK 扩展 A
            | '\u{F900}'..='\u{FAFF}' // CJK 兼容表意文字
            | '\u{3000}'..='\u{303F}' // CJK 标点
            | '\u{FF00}'..='\u{FFEF}' // 全角形式
            | '\u{2E80}'..='\u{2EFF}' // CJK 部首补充
            | '\u{31C0}'..='\u{31EF}' // CJK 笔画
        );
        if is_cjk { count += 1; in_word = false; } else if ch.is_alphanumeric() { if !in_word { count += 1; in_word = true; } } else { in_word = false; }
    }
    
    count

}



// ── Word Count Cache ──

/// 内存缓存：路径 → (mtime 秒, 字数)
type WordCountCache = Mutex<HashMap<PathBuf, (u64, usize)>>;

/// 进程级字数缓存：异步命令与保存路径共用（静态，避免跨线程传递 State）
static WORD_COUNT_CACHE: std::sync::LazyLock<WordCountCache> =
    std::sync::LazyLock::new(WordCountCache::default);

/// 持久化字数索引条目（.stats/wordcounts.json）
#[derive(Debug, Serialize, Deserialize)]
struct WordCountEntry {
    mtime: u64,
    count: usize,
}

fn path_mtime_secs(path: &Path) -> Option<u64> {
    path.metadata()
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

/// 字数索引文件：仅当列目录的路径位于当前项目内时使用
fn word_index_path(app: &tauri::AppHandle, path: &Path) -> Option<PathBuf> {
    let root = project_root_of(app)?;
    if path.starts_with(&root) {
        Some(root.join(".stats").join("wordcounts.json"))
    } else {
        None
    }
}

fn load_word_index(file: &Path) -> HashMap<PathBuf, (u64, usize)> {
    let mut map = HashMap::new();
    let Ok(content) = fs::read_to_string(file) else {
        return map;
    };
    let Ok(entries) = serde_json::from_str::<HashMap<PathBuf, WordCountEntry>>(&content) else {
        return map;
    };
    for (path, entry) in entries {
        // 只保留仍然存在的文件；删除/移动过的条目自动淘汰
        if path.exists() {
            map.insert(path, (entry.mtime, entry.count));
        }
    }
    map
}

fn save_word_index(file: &Path, index: &HashMap<PathBuf, (u64, usize)>) {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).ok();
    }
    let entries: HashMap<&Path, WordCountEntry> = index
        .iter()
        .map(|(p, (mtime, count))| {
            (
                p.as_path(),
                WordCountEntry {
                    mtime: *mtime,
                    count: *count,
                },
            )
        })
        .collect();
    if let Ok(json) = serde_json::to_string_pretty(&entries) {
        fs::write(file, json).ok();
    }
}

/// 获取字数：内存缓存 → 持久化索引 → 重算，命中后回填缓存
fn get_or_compute_word_count(
    path: &Path,
    cache: &WordCountCache,
    index: &mut HashMap<PathBuf, (u64, usize)>,
    index_dirty: &mut bool,
) -> Option<usize> {
    let modified = path_mtime_secs(path)?;

    // 检查内存缓存（先释放锁再计算，避免阻塞）
    {
        let cache_lock = cache.lock().ok()?;
        if let Some(&(cached_mtime, count)) = cache_lock.get(path) {
            if cached_mtime == modified {
                return Some(count);
            }
        }
    }

    // 持久化索引命中：跳过整篇读取
    if let Some(&(idx_mtime, count)) = index.get(path) {
        if idx_mtime == modified {
            if let Ok(mut cache_lock) = cache.lock() {
                cache_lock.insert(path.to_path_buf(), (modified, count));
            }
            return Some(count);
        }
    }

    // 缓存与索引均未命中 → 重新计算
    let content = fs::read_to_string(path).ok()?;
    let count = count_words(&content);

    if let Ok(mut cache_lock) = cache.lock() {
        cache_lock.insert(path.to_path_buf(), (modified, count));
    }
    index.insert(path.to_path_buf(), (modified, count));
    *index_dirty = true;

    Some(count)
}

fn list_entries(
    dir_path: &Path,
    cache: &WordCountCache,
    index: &mut HashMap<PathBuf, (u64, usize)>,
    index_dirty: &mut bool,
) -> Result<Vec<DirEntry>, String> {
    let mut entries: Vec<DirEntry> = Vec::new();
    let dir_iter = fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    for entry in dir_iter {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip(&name) {
            continue;
        }

        let path = entry.path();
        // 符号链接/junction 视为非目录：不递归跟随，防止逃逸出项目或无限递归
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let is_dir = file_type.is_dir() && !file_type.is_symlink();
        let path_str = path.to_string_lossy().to_string();

        let children = if is_dir {
            Some(list_entries(&path, cache, index, index_dirty)?)
        } else {
            None
        };

        let word_count = if !is_dir {
            get_or_compute_word_count(&path, cache, index, index_dirty)
        } else {
            None
        };

        entries.push(DirEntry {
            name,
            path: path_str,
            is_dir,
            children,
            word_count,
        });
    }
    // 文件夹排前，文件排后，各自按名称排序
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir) // true > false，文件夹排前面
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// 同名文件在备份目录里最多保留的备份份数
const MAX_BACKUPS_PER_FILE: usize = 20;

/// 路径中是否含隐藏组件（.stats / .chatlog / .backups 等元数据目录）
fn has_hidden_component(path: &Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s.starts_with('.') && s != "." && s != ".."
    })
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
fn clear_backup_hash(path: &Path) {
    if let Ok(mut cache) = BACKUP_HASH_CACHE.lock() {
        cache.remove(path);
    }
}

fn backup_file(filepath: &Path, new_content: &[u8]) -> Result<(), String> {
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
        .unwrap()
        .as_secs();
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

// ── Project Path ──

#[tauri::command]
fn get_project_path(app: tauri::AppHandle) -> Result<String, String> {
    let config = read_config(&app)?;
    Ok(config["project_path"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
fn set_project_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let mut config = read_config(&app)?;
    config["project_path"] = serde_json::Value::String(path);
    write_config(&app, &config)
}

// ── File Operations ──

#[tauri::command]

/// 异步列目录：递归扫描与字数计算放到阻塞线程池，
/// 避免大项目首次加载时卡住主线程
async fn list_dir(
    app: tauri::AppHandle,
    path: String,
) -> Result<Vec<DirEntry>, String> {

    // 路径沙箱：约束在项目目录内；项目未设置或越界时返回空列表
    let Some(root) = project_root_of(&app) else {
        return Ok(vec![]);
    };
    let dir_path = match resolve_within(&root, &path) {
        Ok(p) => p,
        Err(_) => return Ok(vec![]),
    };
    if !dir_path.exists() {
        return Ok(vec![]);
    }
    let index_file = word_index_path(&app, &dir_path);

    let cache = &WORD_COUNT_CACHE;

    tauri::async_runtime::spawn_blocking(move || {
        let mut index = index_file
            .as_deref()
            .map(load_word_index)
            .unwrap_or_default();
        let mut index_dirty = false;
        let entries = list_entries(&dir_path, cache, &mut index, &mut index_dirty)?;
        if index_dirty {
            if let Some(file) = index_file.as_deref() {
                save_word_index(file, &index);
            }
        }
        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?

}

#[tauri::command]
fn read_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let filepath = resolve_in_project(&app, &path)?;
    fs::read_to_string(&filepath).map_err(|e| e.to_string())
}

#[tauri::command]

fn write_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let filepath = resolve_in_project(&app, &path)?;

    // 确保父目录存在
    if let Some(parent) = filepath.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // 备份（新内容与上次备份一致时自动跳过）
    backup_file(&filepath, content.as_bytes())?;

    // 原子写：先写同目录临时文件，再 rename 覆盖目标，
    // 避免写入中途崩溃/断电留下半截损坏的章节文件
    let tmp = temp_sibling_path(&filepath);
    fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    if let Err(e) = fs::rename(&tmp, &filepath) {
        let _ = fs::remove_file(&tmp);
        return Err(e.to_string());
    }

    // 写入后更新缓存（下次 list_dir 用最新字数）
    if let Ok(mut cache_lock) = WORD_COUNT_CACHE.lock() {
        let count = count_words(&content);
        if let Some(modified) = path_mtime_secs(&filepath) {
            cache_lock.insert(filepath.to_path_buf(), (modified, count));
        }
    }

    Ok(())
}

/// 生成同目录下的隐藏临时文件路径（写完后 rename 覆盖目标）
fn temp_sibling_path(filepath: &Path) -> PathBuf {
    let dir = filepath.parent().unwrap_or(Path::new("."));
    let name = filepath.file_name().unwrap_or_default().to_string_lossy();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    dir.join(format!(".{}.{}.tmp", name, nanos))
}

#[tauri::command]
fn create_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dirpath = resolve_in_project(&app, &path)?;
    fs::create_dir_all(&dirpath).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let filepath = resolve_in_project(&app, &path)?;
    if filepath.exists() {
        return Err(format!("文件已存在: {}", path));
    }
    if let Some(parent) = filepath.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&filepath, "").map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    // P0-5：回收站根目录一律取后端 config，不信任前端传参；
    // 源路径过统一沙箱（C1），杜绝把项目外文件搬进/搬出回收站
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
    let trash_root = root;
    let trash_dir = trash_root.join(".trash");
    fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    let dest = trash_dir.join(format!("{}_{}", ts, filename));
    fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    // 清掉备份去重缓存：恢复或新建同名文件时能正常产生新备份
    clear_backup_hash(&src);

    // 记录元数据，回收站 UI 据此展示与恢复
    let mut meta = read_trash_meta(&trash_root);
    meta.retain(|e| e.trash_path != dest.to_string_lossy());
    meta.push(TrashEntry {
        trash_path: dest.to_string_lossy().to_string(),
        original_path: src.to_string_lossy().to_string(),
        name: filename,
        is_dir,
        deleted_at: ts,
    });
    write_trash_meta(&trash_root, &meta);

    Ok(())
}

// ── Trash ──

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
fn list_trash(app: tauri::AppHandle) -> Vec<TrashEntry> {
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
fn restore_trash(app: tauri::AppHandle, trash_path: String, original_path: String) -> Result<String, String> {
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
    let final_dest = unique_path(parent, name);
    fs::rename(src, &final_dest).map_err(|e| e.to_string())?;
    Ok(final_dest.to_string_lossy().to_string())
}

/// 清空回收站
#[tauri::command]
fn empty_trash(app: tauri::AppHandle) -> Result<(), String> {
    let Some(root) = project_root_of(&app) else {
        return Ok(());
    };
    let dir = root.join(".trash");
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 直接删除文件（用于聊天记录等元数据清理，不进入 .trash）
#[tauri::command]
fn delete_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = resolve_in_project(&app, &path)?;
    if !p.exists() {
        return Ok(());
    }
    if p.is_dir() {
        return Err(format!("目标不是文件: {}", path));
    }
    fs::remove_file(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_path(app: tauri::AppHandle, source: String, dest_dir: String) -> Result<(), String> {
    let src = resolve_in_project(&app, &source)?;
    if !src.exists() {
        return Err(format!("源文件不存在: {}", source));
    }
    let dest_dir_resolved = resolve_in_project(&app, &dest_dir)?;
    // rename 之后源路径已不存在，is_file() 会恒为 false：先记录再迁移备份
    let was_file = src.is_file();
    let filename = src.file_name().unwrap_or_default().to_string_lossy();
    let dest = dest_dir_resolved.join(filename.as_ref());
    if dest.exists() {
        return Err(format!("目标位置已存在同名文件: {}", dest.display()));
    }
    fs::create_dir_all(&dest_dir_resolved).map_err(|e| e.to_string())?;
    fs::rename(&src, &dest).map_err(|e| e.to_string())?;

    // 移动单个文件时，把原目录 .backups 里该文件的历史备份一并搬过去
    // （目录移动时 .backups 随目录整体移动，无需处理）
    if was_file {
        migrate_backups_on_move(&src, &dest);
    }
    clear_backup_hash(&src);
    clear_backup_hash(&dest);

    Ok(())
}

/// 移动文件后，把源目录 .backups 中该文件的历史备份搬进目标目录（失败不阻塞）
fn migrate_backups_on_move(old_path: &Path, new_path: &Path) {
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

#[tauri::command]
fn rename_path(app: tauri::AppHandle, source: String, dest: String) -> Result<(), String> {
    let src = resolve_in_project(&app, &source)?;
    if !src.exists() {
        return Err(format!("源文件不存在: {}", source));
    }
    let dest_path = resolve_in_project(&app, &dest)?;
    if dest_path.exists() {
        return Err(format!("目标位置已存在同名文件: {}", dest_path.display()));
    }
    // rename 之后源路径已不存在，is_file() 会恒为 false：先记录
    let was_file = src.is_file();
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&src, &dest_path).map_err(|e| e.to_string())?;

    // 文件重命名后，把同目录 .backups 里 {ts}_{旧名} 的历史备份改成新名，
    // 否则重命名后历史版本会因文件名不匹配而“失联”
    if was_file {
        migrate_backups_on_rename(&src, &dest_path);
    }
    clear_backup_hash(&src);
    clear_backup_hash(&dest_path);

    Ok(())
}

/// 同目录下把 {ts}_{旧名} 备份改成 {ts}_{新名}（失败不影响主流程）
fn migrate_backups_on_rename(old_path: &Path, new_path: &Path) {
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

/// 只读文件末尾 max_bytes 字节（UTF-8 边界对齐），用于前情提要的章尾片段
#[tauri::command]
fn read_file_tail(app: tauri::AppHandle, path: String, max_bytes: usize) -> Result<String, String> {
    use std::io::{Read, Seek, SeekFrom};
    let filepath = resolve_in_project(&app, &path)?;
    let mut f = fs::File::open(&filepath).map_err(|e| e.to_string())?;
    let len = f.metadata().map_err(|e| e.to_string())?.len();
    if len <= max_bytes as u64 {
        return fs::read_to_string(&filepath).map_err(|e| e.to_string());
    }
    f.seek(SeekFrom::End(-(max_bytes as i64)))
        .map_err(|e| e.to_string())?;
    let mut buf = Vec::with_capacity(max_bytes);
    f.take(max_bytes as u64)
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    // 跳到第一个 UTF-8 字符边界，避免截断多字节字符
    let mut start = 0;
    while start < buf.len() && (buf[start] & 0xC0) == 0x80 {
        start += 1;
    }
    if start >= buf.len() {
        return Ok(String::new());
    }
    Ok(String::from_utf8_lossy(&buf[start..]).into_owned())
}

/// 在系统文件管理器中定位文件/目录（跨平台尽力而为）。
/// 刻意不做项目沙箱：「最近项目」需在其所在文件夹打开资源管理器；
/// 此命令只触发系统 UI，不回传任何数据给 WebView。
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", p.to_string_lossy().replace('/', "\\")))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let target = if p.is_dir() {
            p.to_path_buf()
        } else {
            p.parent().unwrap_or(Path::new(".")).to_path_buf()
        };
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── AI Config ──

#[tauri::command]
fn get_ai_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config = read_config(&app)?;
    Ok(config.get("ai").cloned().unwrap_or(serde_json::json!({})))
}

#[tauri::command]
fn save_ai_config(app: tauri::AppHandle, ai_config: serde_json::Value) -> Result<(), String> {
    let mut config = read_config(&app)?;
    // 剥离明文密钥：密钥改存系统钥匙串（get/set_api_key），config.json 只留非敏感配置
    config["ai"] = strip_api_keys(ai_config);
    write_config(&app, &config)
}

/// 递归删除 configs.*.apiKey（兼容旧格式单 provider 的顶层 apiKey）
fn strip_api_keys(mut value: serde_json::Value) -> serde_json::Value {
    if let Some(configs) = value.get_mut("configs").and_then(|c| c.as_object_mut()) {
        for (_, v) in configs.iter_mut() {
            if let Some(obj) = v.as_object_mut() {
                obj.remove("apiKey");
            }
        }
    }
    if let Some(obj) = value.as_object_mut() {
        obj.remove("apiKey");
    }
    value
}

// ── API Key 安全存储（系统钥匙串：Windows 凭据管理器 / macOS Keychain） ──

const KEYRING_SERVICE: &str = "yanyan";

/// 从系统钥匙串读取某服务商的 API Key；未保存/读取失败返回 None
#[tauri::command]
fn get_api_key(provider: String) -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, &provider)
        .ok()?
        .get_password()
        .ok()
}

/// 把 API Key 写入系统钥匙串；传空串表示删除已保存的密钥
#[tauri::command]
fn set_api_key(provider: String, api_key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &provider).map_err(|e| e.to_string())?;
    if api_key.trim().is_empty() {
        // 删除失败（无条目/平台不支持）当作已清除，不阻塞保存流程
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry.set_password(&api_key).map_err(|e| e.to_string())
}

// ── Project Index ──

#[tauri::command]
fn get_project_index(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config = read_config(&app)?;
    Ok(config.get("project_index").cloned().unwrap_or(serde_json::json!([])))
}

#[tauri::command]
fn save_project_index(app: tauri::AppHandle, index: serde_json::Value) -> Result<(), String> {
    let mut config = read_config(&app)?;
    config["project_index"] = index;
    write_config(&app, &config)
}

// ── Export ──

#[tauri::command]
fn export_project(app: tauri::AppHandle, paths: Vec<String>, dest_path: String, with_titles: bool) -> Result<(), String> {
    let mut out = String::new();
    for (i, p) in paths.iter().enumerate() {
        // 源文件过路径沙箱；导出目标是用户在保存对话框中选择的位置，允许位于项目外（刻意豁免）
        let resolved = resolve_in_project(&app, p)?;
        let content = fs::read_to_string(&resolved).map_err(|e| format!("读取失败 {}: {}", p, e))?;
        if with_titles {
            let name = Path::new(p)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            out.push_str(&format!("# {}\n\n", name));
        }
        out.push_str(&content);
        if i + 1 < paths.len() {
            out.push_str("\n\n");
        }
    }
    if let Some(parent) = Path::new(&dest_path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&dest_path, out).map_err(|e| e.to_string())
}

// ── Import / Path Check ──

/// 校验文件名组件：剔除 Windows 非法字符，拒绝空、"."、".."
fn sanitize_component(name: &str) -> Option<String> {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\0'))
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
        return None;
    }
    Some(cleaned.to_string())
}

/// 目标已存在时生成唯一名：第1章.md → 第1章 (2).md
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    if !dir.join(name).exists() {
        return dir.join(name);
    }
    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name);
    let ext = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    for i in 2..10000 {
        let candidate = if ext.is_empty() {
            format!("{} ({})", stem, i)
        } else {
            format!("{} ({}).{}", stem, i, ext)
        };
        if !dir.join(&candidate).exists() {
            return dir.join(candidate);
        }
    }
    dir.join(name)
}

/// 外部拖入：把文件复制进项目（保留子目录结构，重名自动加序号）
#[tauri::command]
fn import_files(app: tauri::AppHandle, dest_dir: String, files: Vec<ImportFile>) -> Result<usize, String> {
    let dest = resolve_in_project(&app, &dest_dir)?;
    if !dest.exists() || !dest.is_dir() {
        return Err(format!("目标目录不存在: {}", dest_dir));
    }
    let mut count = 0usize;
    for f in files {
        // 逐级清洗相对路径，拒绝绝对路径 / .. / 盘符注入；
        // 单个文件非法时跳过它，不影响同批其它文件
        let mut parts: Vec<String> = Vec::new();
        let mut invalid = false;
        for comp in f.rel_path.replace('\\', "/").split('/') {
            match sanitize_component(comp) {
                Some(c) => parts.push(c),
                None => {
                    invalid = true;
                    break;
                }
            }
        }
        if invalid || parts.is_empty() {
            continue;
        }
        let bytes = BASE64.decode(f.base64_data.as_bytes()).map_err(|e| e.to_string())?;
        let mut current = dest.to_path_buf();
        for (i, part) in parts.iter().enumerate() {
            if i == parts.len() - 1 {
                let target = unique_path(&current, part);
                fs::write(&target, &bytes).map_err(|e| e.to_string())?;
                count += 1;
            } else {
                current = current.join(part);
                fs::create_dir_all(&current).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(count)
}

/// 仅返回存在性、不回传任何内容；「最近项目」列表需要检查非当前项目文件夹，故不做项目沙箱。
#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// 打开 WebView2 的外部拖放开关（AllowExternalDrop 默认关闭）。
/// 关闭时：资源管理器的文件无法拖入应用，且我们自己的原生拖拽也无法落回
/// 应用内（内部移动失效）。打开后两类拖入都走 HTML5 drop 事件正常处理。
#[tauri::command]
fn enable_external_drop(webview: tauri::Webview) -> Result<(), String> {
    #[cfg(windows)]
    {
        webview
            .with_webview(|platform_webview| {
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller4;
                use windows_core::Interface; // cast 方法来自 Interface trait
                let controller = platform_webview.controller();
                match controller.cast::<ICoreWebView2Controller4>() {
                    Ok(c4) => match unsafe { c4.SetAllowExternalDrop(true) } {
                        Ok(()) => eprintln!("[webview] AllowExternalDrop 已打开"),
                        Err(e) => eprintln!("[webview] AllowExternalDrop 打开失败: {}", e),
                    },
                    Err(e) => eprintln!("[webview] Controller4 转换失败: {}", e),
                }
            })
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = webview;
        Ok(())
    }
}

/// 原生拖出：把文件拖到外部软件（CF_HDROP，复制语义），返回最终拖放效果值。
/// 必须在主线程执行 DoDragDrop（工作线程无消息泵，会挂起或初始化失败）。
#[tauri::command]
async fn drag_out_files(app: tauri::AppHandle, paths: Vec<String>) -> Result<u32, String> {
    #[cfg(windows)]
    {
        // 防御：无论前端传了什么，只拖第一个（单文件语义）
        // 路径沙箱：仅允许拖出项目内文件，非法路径静默丢弃（前端只传文件树里的路径）
        let paths: Vec<String> = paths
            .into_iter()
            .take(1)
            .filter_map(|p| {
                resolve_in_project(&app, &p)
                    .ok()
                    .map(|pb| pb.to_string_lossy().to_string())
            })
            .collect();
        if paths.is_empty() {
            return Ok(0);
        }
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let result = native_drag::run_drag(paths);
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = paths;
        Err("原生拖放仅支持 Windows".to_string())
    }
}


// ── EPUB Export ──

const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#;

fn escape_xml(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

/// 极简 Markdown → XHTML 正文（标题 / 段落；每行一段，兼容中文小说无空行分段）
fn chapter_xhtml(name: &str, raw: &str) -> String {
    let mut body = String::new();
    for line in raw.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        if let Some(h) = t.strip_prefix("### ") {
            body.push_str(&format!("<h3>{}</h3>\n", escape_xml(h.trim())));
        } else if let Some(h) = t.strip_prefix("## ") {
            body.push_str(&format!("<h2>{}</h2>\n", escape_xml(h.trim())));
        } else if let Some(h) = t.strip_prefix("# ") {
            body.push_str(&format!("<h2>{}</h2>\n", escape_xml(h.trim())));
        } else {
            body.push_str(&format!("<p>{}</p>\n", escape_xml(t)));
        }
    }
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>{name}</title></head>
<body><h1>{name}</h1>
{body}</body>
</html>"#,
        name = escape_xml(name),
        body = body,
    )
}

fn build_nav(title: &str, chapters: &[String]) -> String {
    let mut items = String::new();
    for (i, name) in chapters.iter().enumerate() {
        items.push_str(&format!(
            "      <li><a href=\"c{:03}.xhtml\">{}</a></li>\n",
            i + 1,
            escape_xml(name),
        ));
    }
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>目录</title></head>
<body>
  <nav epub:type="toc">
    <h1>{title}</h1>
    <ol>
{items}    </ol>
  </nav>
</body>
</html>"#,
        title = escape_xml(title),
        items = items,
    )
}

fn build_opf(title: &str, count: usize) -> String {
    let mut manifest = String::from(
        "    <item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>\n",
    );
    let mut spine = String::new();
    for i in 1..=count {
        let id = format!("c{:03}", i);
        manifest.push_str(&format!(
            "    <item id=\"{id}\" href=\"{id}.xhtml\" media-type=\"application/xhtml+xml\"/>\n"
        ));
        spine.push_str(&format!("    <itemref idref=\"{id}\"/>\n"));
    }
    // 无 uuid crate，用时间与地址拼一个唯一 id
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let uuid = format!(
        "urn:uuid:{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        (nanos >> 32) as u32,
        (nanos >> 16) as u16,
        (nanos >> 48) as u16 & 0x4fff | 0x4000,
        ((nanos >> 8) as u16 & 0x3fff) | 0x8000,
        nanos & 0xffffffffffff,
    );
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">{uuid}</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
{manifest}  </manifest>
  <spine>
{spine}  </spine>
</package>"#,
        uuid = uuid,
        title = escape_xml(title),
        manifest = manifest,
        spine = spine,
    )
}

/// 导出合并 EPUB3：章节打包为 XHTML + 目录 + OPF
#[tauri::command]
fn export_epub(app: tauri::AppHandle, paths: Vec<String>, dest_path: String, title: String) -> Result<(), String> {
    use std::io::Write;

    if paths.is_empty() {
        return Err("没有可导出的章节".to_string());
    }
    let title = if title.trim().is_empty() {
        "未命名作品".to_string()
    } else {
        title.trim().to_string()
    };

    let mut names: Vec<String> = Vec::new();
    let mut xhtmls: Vec<String> = Vec::new();
    for p in &paths {
        // 源文件过路径沙箱；导出目标是用户选择的保存位置，允许位于项目外（刻意豁免）
        let resolved = resolve_in_project(&app, p)?;
        let raw = fs::read_to_string(&resolved).map_err(|e| format!("读取失败 {}: {}", p, e))?;
        let name = Path::new(p)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        names.push(name.clone());
        xhtmls.push(chapter_xhtml(&name, &raw));
    }

    if let Some(parent) = Path::new(&dest_path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let stored = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored);
    let deflated = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // mimetype 必须第一个写入且不压缩
    zip.start_file("mimetype", stored).map_err(|e| e.to_string())?;
    zip.write_all(b"application/epub+zip").map_err(|e| e.to_string())?;

    zip.start_file("META-INF/container.xml", deflated).map_err(|e| e.to_string())?;
    zip.write_all(CONTAINER_XML.as_bytes()).map_err(|e| e.to_string())?;

    zip.start_file("nav.xhtml", deflated).map_err(|e| e.to_string())?;
    zip.write_all(build_nav(&title, &names).as_bytes()).map_err(|e| e.to_string())?;

    for (i, x) in xhtmls.iter().enumerate() {
        zip.start_file(format!("c{:03}.xhtml", i + 1), deflated).map_err(|e| e.to_string())?;
        zip.write_all(x.as_bytes()).map_err(|e| e.to_string())?;
    }

    zip.start_file("content.opf", deflated).map_err(|e| e.to_string())?;
    zip.write_all(build_opf(&title, xhtmls.len()).as_bytes()).map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// 文件修改时间（秒），用于检测外部修改
#[tauri::command]
fn file_mtime(app: tauri::AppHandle, path: String) -> Option<u64> {
    let p = resolve_in_project(&app, &path).ok()?;
    let modified = p.metadata().ok()?.modified().ok()?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

// ── 角色出场统计 ──

#[derive(serde::Serialize)]
struct MentionStat {
    name: String,
    count: usize,
    last_file: String,
}

/// 角色名在正文中的出现统计（纯本地规则匹配，零 AI 消耗）。
/// 返回每个名字的总出现次数与最近出现的正文文件（相对路径）。
/// 排除 角色/大纲/.summaries/.stats/.trash/.backups 目录与 _ 开头文件，
/// 避免设定文件自身、摘要与回收站内容造成失真。
#[tauri::command]
fn scan_mentions(app: tauri::AppHandle, names: Vec<String>) -> Result<Vec<MentionStat>, String> {
    let root = project_root_of(&app).ok_or_else(|| "尚未设置项目目录".to_string())?;

    let mut stats: Vec<MentionStat> = names
        .iter()
        .map(|n| n.trim().to_string())
        .filter(|n| n.chars().count() >= 2 && !n.chars().all(|c| c.is_ascii_digit()))
        .map(|name| MentionStat { name, count: 0, last_file: String::new() })
        .collect();
    if stats.is_empty() {
        return Ok(stats);
    }

    // 收集正文文件（相对路径 + 小写全文），内容总量超 32MB 停止
    let mut files: Vec<(String, String)> = Vec::new();
    collect_body_files(&root, &root, &mut files, 0);

    let lowered: Vec<String> = stats.iter().map(|s| s.name.to_lowercase()).collect();
    for (rel, text) in &files {
        for i in 0..stats.len() {
            let c = text.matches(lowered[i].as_str()).count();
            if c > 0 {
                stats[i].count += c;
                stats[i].last_file = rel.clone();
            }
        }
    }
    Ok(stats)
}

/// 递归收集正文 .md/.txt 文件：跳过设定/摘要/统计/回收站目录与 _ 开头文件
fn collect_body_files(root: &Path, dir: &Path, out: &mut Vec<(String, String)>, mut bytes: usize) -> usize {
    if bytes > 32 * 1024 * 1024 {
        return bytes;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return bytes,
    };
    for ent in entries.flatten() {
        let path = ent.path();
        let name = ent.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.starts_with('_') {
            continue;
        }
        if matches!(name.as_str(), "角色" | "大纲" | ".summaries" | ".stats" | ".trash" | ".backups" | ".chatlog") {
            continue;
        }
        if path.is_dir() {
            bytes = collect_body_files(root, &path, out, bytes);
        } else if name.ends_with(".md") || name.ends_with(".txt") {
            if let Ok(raw) = fs::read(&path) {
                bytes += raw.len();
                let rel = path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                out.push((rel, String::from_utf8_lossy(&raw).to_lowercase()));
            }
        }
    }
    bytes
}

// ── Backups ──

/// 列出指定文件的备份历史（按时间倒序，最新在前）
#[tauri::command]
fn list_backups(app: tauri::AppHandle, file_path: String) -> Result<Vec<BackupEntry>, String> {
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

// ── Entry ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()

        .plugin(tauri_plugin_dialog::init())

        .invoke_handler(tauri::generate_handler![
            get_project_path,
            set_project_path,
            list_dir,
            read_file,
            read_file_tail,
            write_file,
            create_dir,
            create_file,
            delete_path,
            delete_file,
            list_trash,
            restore_trash,
            empty_trash,
            move_path,
            rename_path,
            get_ai_config,
            save_ai_config,
            get_api_key,
            set_api_key,
            get_project_index,
            save_project_index,
            export_project,
            export_epub,
            file_mtime,
            scan_mentions,
            list_backups,
            import_files,
            path_exists,
            reveal_path,
            drag_out_files,
            enable_external_drop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
