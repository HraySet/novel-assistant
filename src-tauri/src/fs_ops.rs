//! 文件系统命令：读、写、建、删、移动、重命名、导入，以及字数缓存。
//!
//! 写盘铁律（改动前请读完）：
//! 1. 任何路径先过 `resolve_in_project` 沙箱；
//! 2. 先 `backup_file` 备份，再写同目录临时文件，最后 `rename` 覆盖——
//!    中途崩溃只会留下一个 `.tmp`，不会留下半截章节；
//! 3. 写成功后回填字数缓存，避免下次列目录重算整篇。

use crate::backup::{
    backup_file, clear_backup_hash, migrate_backups_on_move, migrate_backups_on_rename,
};
use crate::paths::{
    encode_uri_component, path_mtime_secs, project_root_of, resolve_in_project, resolve_within,
    sanitize_component, should_skip, unique_path,
};

/// 摘掉正文文件的扩展名（.md/.txt，大小写不敏感），用于摘要文件名。
/// 与前端 `chapterStem` 保持一致。
fn chapter_stem(name: &str) -> &str {
    // 用 strip_suffix 按 ASCII 后缀精确匹配并安全截断，
    // 不能按 name.len()-3 手动切片——中文是 3 字节/字符，会切到字符中间
    for suffix in [".md", ".MD", ".txt", ".TXT", ".Md", ".mD", ".Txt", ".tXT"] {
        if let Some(stripped) = name.strip_suffix(suffix) {
            return stripped;
        }
    }
    name
}

/// 章节重命名后，把 `.summaries/<旧章名>.md` 改成 `<新章名>.md`（失败不阻塞）。
///
/// 摘要按「章名（去扩展名）」关联，存在项目根的 `.summaries/` 下。章节一改名，
/// 旧摘要就失联，前情提要会静默降级成读章尾片段——用户察觉不到，只觉得
/// 「AI 好像不记得前面的剧情了」。这里在重命名时同步迁移。
fn migrate_summary_on_rename(app: &tauri::AppHandle, old_path: &std::path::Path, new_path: &std::path::Path) {
    let (Some(old_name), Some(new_name)) = (old_path.file_name(), new_path.file_name()) else {
        return;
    };
    let old_name = old_name.to_string_lossy();
    let new_name = new_name.to_string_lossy();
    let old_stem = chapter_stem(&old_name);
    let new_stem = chapter_stem(&new_name);
    // 去扩展名后相同（例如 第1章.md → 第1章.txt），摘要名不变，无需迁移
    if old_stem == new_stem {
        return;
    }
    let Some(root) = project_root_of(app) else {
        return;
    };
    let summary_dir = root.join(".summaries");
    let from = summary_dir.join(format!("{}.md", old_stem));
    let to = summary_dir.join(format!("{}.md", new_stem));
    if from.exists() && !to.exists() {
        let _ = fs::rename(&from, &to);
    }
}

/// 绝对路径 → 相对项目根的规范化相对路径（统一 `/` 分隔符）。
/// 与前端 `toRelativePath`（core/paths.ts）语义一致，用于撤销历史文件名。
fn to_relative_path(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let mut out = String::new();
    for (i, comp) in rel.components().enumerate() {
        if i > 0 {
            out.push('/');
        }
        out.push_str(&comp.as_os_str().to_string_lossy());
    }
    Some(out)
}

/// 重命名/移动章节后，迁移 `.stats/undo/` 下的撤销历史文件（T1 后端一半）。
///
/// 撤销历史文件按「相对项目根的路径 + 固定 `/`」编码命名（`encode_uri_component(相对路径).json`）。
/// 章节重命名/移动会改变相对路径，这里把旧 undo 文件 rename 到新名，否则撤销历史失联。
/// 目录重命名时，遍历 undo 目录做前缀 remap（旧相对前缀 → 新相对前缀）。
fn migrate_undo_on_rename(app: &tauri::AppHandle, old_path: &Path, new_path: &Path) {
    let Some(root) = project_root_of(app) else {
        return;
    };
    let Some(old_rel) = to_relative_path(&root, old_path) else {
        return;
    };
    let Some(new_rel) = to_relative_path(&root, new_path) else {
        return;
    };
    let undo_dir = root.join(".stats").join("undo");
    if !undo_dir.exists() {
        return;
    }

    // 单文件：旧相对路径精确等于某 undo 文件名，直接 rename
    let old_file = undo_dir.join(format!("{}.json", encode_uri_component(&old_rel)));
    if old_file.exists() {
        let new_file = undo_dir.join(format!("{}.json", encode_uri_component(&new_rel)));
        if !new_file.exists() {
            let _ = fs::rename(&old_file, &new_file);
        }
        return;
    }

    // 目录重命名：遍历 undo 目录，把「旧相对前缀 + /」开头的文件名前缀 remap 到新相对前缀。
    // 旧相对路径形如 卷1/第2章.md，编码后的文件名前缀为 encode_uri_component("卷1/")。
    let old_prefix = encode_uri_component(&format!("{}/", old_rel));
    let new_prefix = encode_uri_component(&format!("{}/", new_rel));
    let Ok(entries) = fs::read_dir(&undo_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(rest) = name.strip_prefix(&old_prefix) {
            let to = undo_dir.join(format!("{}{}", new_prefix, rest));
            if !to.exists() {
                let _ = fs::rename(entry.path(), &to);
            }
        }
    }
}
use crate::types::{DirEntry, ImportFile};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// 读文本文件，UTF-8 优先；失败（GBK/GB18030 等中文旧编码）时按 GB18030 解码兜底。
///
/// 中文作者从 WPS/旧软件导出的 txt 大量是 GBK/GB2312，`fs::read_to_string`（严格 UTF-8）
/// 会直接失败。这里字节级判断：先试 UTF-8，失败再按 GB18030（GBK 超集）解码，保证旧稿可读。
fn read_text_utf8_or_gb18030(filepath: &Path) -> Result<String, String> {
    let bytes = fs::read(filepath).map_err(|e| e.to_string())?;
    // 空文件直接返回空串
    if bytes.is_empty() {
        return Ok(String::new());
    }
    match std::str::from_utf8(&bytes) {
        Ok(s) => Ok(s.to_string()),
        Err(_) => {
            // 非 UTF-8：按 GB18030 解码（GB18030 兼容 GBK/GB2312）
            let (cow, _, had_errors) = encoding_rs::GB18030.decode(&bytes);
            if had_errors {
                // 仍有解码错误（非文本或未知编码）：退回 lossy，保证不崩
                Ok(cow.into_owned())
            } else {
                Ok(cow.into_owned())
            }
        }
    }
}

// ── 字数统计 ──

/// 统计中英文混排文本的字数：每个 CJK 字符计为 1 字，英文按空格分词计数
pub fn count_words(text: &str) -> usize {
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
        if is_cjk {
            count += 1;
            in_word = false;
        } else if ch.is_alphanumeric() {
            if !in_word {
                count += 1;
                in_word = true;
            }
        } else {
            in_word = false;
        }
    }

    count
}

// ── 字数缓存 ──

/// 内存缓存：路径 → (mtime 秒, 字数)
type WordCountCache = Mutex<HashMap<PathBuf, (u64, usize)>>;

/// 进程级字数缓存：异步命令与保存路径共用（静态，避免跨线程传递 State）
static WORD_COUNT_CACHE: std::sync::LazyLock<WordCountCache> =
    std::sync::LazyLock::new(WordCountCache::default);

/// 持久化字数索引条目（.stats/wordcounts.json）
#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct WordCountEntry {
    mtime: u64,
    count: usize,
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
    let content = read_text_utf8_or_gb18030(path).ok()?;
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

// ── 命令 ──

/// 异步列目录：递归扫描与字数计算放到阻塞线程池，
/// 避免大项目首次加载时卡住主线程
#[tauri::command]
pub async fn list_dir(app: tauri::AppHandle, path: String) -> Result<Vec<DirEntry>, String> {
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
pub fn read_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let filepath = resolve_in_project(&app, &path)?;
    read_text_utf8_or_gb18030(&filepath)
}

#[tauri::command]
pub fn write_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
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
pub fn create_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dirpath = resolve_in_project(&app, &path)?;
    fs::create_dir_all(&dirpath).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let filepath = resolve_in_project(&app, &path)?;
    if filepath.exists() {
        return Err(format!("文件已存在: {}", path));
    }
    if let Some(parent) = filepath.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&filepath, "").map_err(|e| e.to_string())
}

/// 直接删除文件（用于聊天记录等元数据清理，不进入 .trash）
#[tauri::command]
pub fn delete_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
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
pub fn move_path(app: tauri::AppHandle, source: String, dest_dir: String) -> Result<(), String> {
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
    // 撤销历史（.stats/undo）按相对路径命名，移动会改变相对路径，需迁移
    migrate_undo_on_rename(&app, &src, &dest);
    clear_backup_hash(&src);
    clear_backup_hash(&dest);

    Ok(())
}

#[tauri::command]
pub fn rename_path(app: tauri::AppHandle, source: String, dest: String) -> Result<(), String> {
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
        migrate_summary_on_rename(&app, &src, &dest_path);
    }
    // 撤销历史（.stats/undo）按相对路径命名，重命名（含目录）会改变相对路径，需迁移
    migrate_undo_on_rename(&app, &src, &dest_path);
    clear_backup_hash(&src);
    clear_backup_hash(&dest_path);

    Ok(())
}

/// 只读文件末尾 max_bytes 字节（UTF-8 边界对齐），用于前情提要的章尾片段
#[tauri::command]
pub fn read_file_tail(
    app: tauri::AppHandle,
    path: String,
    max_bytes: usize,
) -> Result<String, String> {
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

/// 文件修改时间（秒），用于检测外部修改
#[tauri::command]
pub fn file_mtime(app: tauri::AppHandle, path: String) -> Option<u64> {
    let p = resolve_in_project(&app, &path).ok()?;
    let modified = p.metadata().ok()?.modified().ok()?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

/// 预检阶段：完成路径清洗与 base64 解码，返回可写盘的结构。
/// 任一路径非法跳过该文件（保持「单个非法不影响同批」约定）；
/// 任一 base64 非法整体报错，保证调用方一个字节都不写。
fn prepare_imports(files: &[ImportFile]) -> Result<Vec<(Vec<String>, Vec<u8>)>, String> {
    let mut prepared: Vec<(Vec<String>, Vec<u8>)> = Vec::new();
    for f in files {
        // 逐级清洗相对路径，拒绝绝对路径 / .. / 盘符注入
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
        prepared.push((parts, bytes));
    }
    Ok(prepared)
}

/// 外部拖入：把文件复制进项目（保留子目录结构，重名自动加序号）
#[tauri::command]
pub fn import_files(    app: tauri::AppHandle,
    dest_dir: String,
    files: Vec<ImportFile>,
) -> Result<usize, String> {
    let dest = resolve_in_project(&app, &dest_dir)?;
    if !dest.exists() || !dest.is_dir() {
        return Err(format!("目标目录不存在: {}", dest_dir));
    }

    // 先全部预检（路径清洗 + base64 解码），把「可能失败的解析」与「写盘」分离；
    // 任一 base64 非法则整体报错、一个字节都不写，避免留下「导了一半」的半成品。
    let prepared = prepare_imports(&files)?;

    // 写盘阶段：全部解析成功后才执行，失败概率已大幅下降
    let mut count = 0usize;
    for (parts, bytes) in prepared {
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

#[cfg(test)]
mod tests {
    use super::{chapter_stem, count_words, prepare_imports, read_text_utf8_or_gb18030};
    use std::fs;

    #[test]
    fn strips_md_and_txt_extension_case_insensitive() {
        assert_eq!(chapter_stem("第1章.md"), "第1章");
        assert_eq!(chapter_stem("第1章.txt"), "第1章");
        assert_eq!(chapter_stem("第1章.MD"), "第1章");
        assert_eq!(chapter_stem("第1章.TXT"), "第1章");
    }

    #[test]
    fn keeps_name_without_known_extension() {
        assert_eq!(chapter_stem("楔子"), "楔子");
        assert_eq!(chapter_stem("我的_草稿"), "我的_草稿");
    }

    /// 与前端 `utils/countWords.ts` 必须给出一致结果：
    /// CJK 字符（含 CJK 标点/全角）逐字计 1，英文/数字按连续串计 1。
    #[test]
    fn counts_cjk_per_character() {
        assert_eq!(count_words("你好"), 2);
        assert_eq!(count_words("这是一个测试"), 6);
    }

    #[test]
    fn counts_latin_per_word() {
        assert_eq!(count_words("hello world"), 2);
        assert_eq!(count_words("a1 b2 c3"), 3);
    }

    #[test]
    fn counts_mixed_text() {
        // 你好(2) + 逗号是 ASCII 不计 + 空格 + world(1)
        assert_eq!(count_words("你好, world"), 3);
    }

    #[test]
    fn counts_cjk_punctuation_but_not_ascii() {
        // 他说：走。（中英文标点区别对待：全角/CJK 标点计入，ASCII 不计）
        assert_eq!(count_words("他说：走。"), 5);
    }

    #[test]
    fn empty_text_is_zero() {
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("   \n\t"), 0);
    }

    // ── 编码检测（T5：GBK 旧稿可读）──

    #[test]
    fn read_utf8_passthrough() {
        let dir = std::env::temp_dir().join(format!("qingbi-enc-utf8-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.txt");
        fs::write(&f, "第1章 正文".as_bytes()).unwrap();
        assert_eq!(read_text_utf8_or_gb18030(&f).unwrap(), "第1章 正文");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_gb18030_fallback() {
        // 用 GB18030 编码写「第1章 正文」，UTF-8 严格解码会失败，应回退 GB18030 解出原文
        let (gbk_bytes, _, _) = encoding_rs::GB18030.encode("第1章 正文");
        let dir = std::env::temp_dir().join(format!("qingbi-enc-gbk-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("b.txt");
        fs::write(&f, &gbk_bytes).unwrap();
        assert_eq!(read_text_utf8_or_gb18030(&f).unwrap(), "第1章 正文");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_empty_file() {
        let dir = std::env::temp_dir().join(format!("qingbi-enc-empty-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("c.txt");
        fs::write(&f, []).unwrap();
        assert_eq!(read_text_utf8_or_gb18030(&f).unwrap(), "");
        let _ = fs::remove_dir_all(&dir);
    }

    // ── import_files 预检（base64 非法时整体报错，路径非法时跳过单个）──

    #[test]
    fn prepare_imports_rejects_bad_base64_wholesale() {
        use base64::{engine::general_purpose::STANDARD as B64, Engine};
        use crate::types::ImportFile;

        let files = vec![
            ImportFile { rel_path: "第1章.md".into(), base64_data: B64.encode("合法内容") },
            ImportFile { rel_path: "第2章.md".into(), base64_data: "!!!not-base64!!!".into() },
        ];

        // 任一 base64 非法 → 整体报错（而非写入第一个、跳过第二个）
        assert!(prepare_imports(&files).is_err(), "base64 非法应整体报错");
    }

    #[test]
    fn prepare_imports_skips_invalid_path_but_keeps_valid() {
        use base64::{engine::general_purpose::STANDARD as B64, Engine};
        use crate::types::ImportFile;

        let files = vec![
            ImportFile { rel_path: "../逃逸.md".into(), base64_data: B64.encode("x") },
            ImportFile { rel_path: "第1章.md".into(), base64_data: B64.encode("合法内容") },
        ];

        // 路径非法 → 跳过单个；合法文件保留
        let prepared = prepare_imports(&files).unwrap();
        assert_eq!(prepared.len(), 1, "只有合法文件被保留");
        assert_eq!(prepared[0].0, vec!["第1章.md".to_string()]);
        assert_eq!(prepared[0].1, "合法内容".as_bytes());
    }
}
