use serde::{Deserialize, Serialize};

use std::collections::HashMap;

use std::fs;

use std::path::{Path, PathBuf};

use std::sync::Mutex;

use std::time::SystemTime;

use tauri::Manager;

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



type WordCountCache = Mutex<HashMap<PathBuf, (SystemTime, usize)>>;



/// 从缓存获取字数，若 mtime 变化或缓存未命中则重新计算并缓存

fn get_or_compute_word_count(path: &Path, cache: &WordCountCache) -> Option<usize> {

    let modified = path.metadata().ok()?.modified().ok()?;



    // 检查缓存（先释放锁再计算，避免阻塞）

    {

        let cache_lock = cache.lock().ok()?;

        if let Some(&(cached_mtime, count)) = cache_lock.get(path) {

            if cached_mtime == modified {

                return Some(count);

            }

        }

    }



    // 缓存未命中或已过期 → 重新计算

    let content = fs::read_to_string(path).ok()?;

    let count = count_words(&content);



    if let Ok(mut cache_lock) = cache.lock() {

        cache_lock.insert(path.to_path_buf(), (modified, count));

    }



    Some(count)

}



fn list_entries(dir_path: &Path, cache: &WordCountCache) -> Result<Vec<DirEntry>, String> {

    let mut entries: Vec<DirEntry> = Vec::new();

    let dir_iter = fs::read_dir(dir_path).map_err(|e| e.to_string())?;



    for entry in dir_iter {

        let entry = entry.map_err(|e| e.to_string())?;

        let name = entry.file_name().to_string_lossy().to_string();

        if should_skip(&name) {

            continue;

        }



        let path = entry.path();

        let is_dir = path.is_dir();

        let path_str = path.to_string_lossy().to_string();



        let children = if is_dir {

            Some(list_entries(&path, cache)?)

        } else {

            None

        };



        let word_count = if !is_dir {

            get_or_compute_word_count(&path, cache)

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

fn backup_file(filepath: &Path) -> Result<(), String> {
    if !filepath.exists() {
        return Ok(());
    }
    // 元数据目录（统计、聊天记录等）无需备份，避免堆积
    if has_hidden_component(filepath) {
        return Ok(());
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

fn list_dir(path: String, cache: tauri::State<'_, WordCountCache>) -> Result<Vec<DirEntry>, String> {

    let dir_path = Path::new(&path);

    if !dir_path.exists() {

        return Ok(vec![]);

    }

    list_entries(dir_path, &cache)

}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]

fn write_file(path: String, content: String, cache: tauri::State<'_, WordCountCache>) -> Result<(), String> {

    let filepath = Path::new(&path);

    // 确保父目录存在

    if let Some(parent) = filepath.parent() {

        fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    }

    // 备份

    backup_file(filepath)?;

    // 写入

    fs::write(filepath, &content).map_err(|e| e.to_string())?;

    // 写入后更新缓存（下次 list_dir 用最新字数）

    if let Ok(mut cache_lock) = cache.lock() {

        let count = count_words(&content);

        if let Ok(modified) = filepath.metadata().and_then(|m| m.modified()) {

            cache_lock.insert(filepath.to_path_buf(), (modified, count));

        }

    }

    Ok(())

}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err(format!("文件已存在: {}", path));
    }
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, "").map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let src = Path::new(&path);
    if !src.exists() {
        return Ok(());
    }
    // 移到项目根下的 .trash
    let filename = src.file_name().unwrap_or_default().to_string_lossy();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // 找项目根目录（向上找到包含 _project.md 或最高两层）
    let mut root = src.to_path_buf();
    for _ in 0..3 {
        if let Some(parent) = root.parent() {
            root = parent.to_path_buf();
        }
    }
    let trash_dir = root.join(".trash");
    fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    let dest = trash_dir.join(format!("{}_{}", ts, filename));
    fs::rename(src, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_path(source: String, dest_dir: String) -> Result<(), String> {
    let src = Path::new(&source);
    if !src.exists() {
        return Err(format!("源文件不存在: {}", source));
    }
    let filename = src.file_name().unwrap_or_default().to_string_lossy();
    let dest = Path::new(&dest_dir).join(filename.as_ref());
    if dest.exists() {
        return Err(format!("目标位置已存在同名文件: {}", dest.display()));
    }
    fs::create_dir_all(Path::new(&dest_dir)).map_err(|e| e.to_string())?;
    fs::rename(src, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_path(source: String, dest: String) -> Result<(), String> {
    let src = Path::new(&source);
    if !src.exists() {
        return Err(format!("源文件不存在: {}", source));
    }
    let dest_path = Path::new(&dest);
    if dest_path.exists() {
        return Err(format!("目标位置已存在同名文件: {}", dest_path.display()));
    }
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(src, dest_path).map_err(|e| e.to_string())
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
    config["ai"] = ai_config;
    write_config(&app, &config)
}

// ── Entry ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()

        .plugin(tauri_plugin_dialog::init())

        .manage(WordCountCache::default())

        .invoke_handler(tauri::generate_handler![
            get_project_path,
            set_project_path,
            list_dir,
            read_file,
            write_file,
            create_dir,
            create_file,
            delete_path,
            move_path,
            rename_path,
            get_ai_config,
            save_ai_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
