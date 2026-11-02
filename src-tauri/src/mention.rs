//! 角色出场统计（纯本地规则匹配，零 AI 消耗）。
//!
//! 两处修正（原实现都在这一步踩坑）：
//! 1. **命令改 async + spawn_blocking**：原先同步命令要读最多 32MB 正文做字符串匹配，
//!    在主线程执行会把界面卡住（`list_dir` 早就用了 spawn_blocking，这个漏了）。
//! 2. **「最近出现」按 mtime 取最大**：原先取的是目录迭代顺序里最后一个命中文件，
//!    与目录顺序挂钩，跟"最近"毫无关系，UI 上的「最近 第3章.md」是假的。
//!
//! 同时改为**逐文件流式扫描**：读一个、匹配、丢弃，峰值内存只与单文件大小相关。

use crate::paths::{path_mtime_secs, project_root_of};
use crate::types::MentionStat;
use std::fs;
use std::path::{Path, PathBuf};

/// 正文扫描总量上限（超过后停止继续读取）
const SCAN_MAX_BYTES: usize = 32 * 1024 * 1024;

/// 不参与统计的目录名（设定、摘要、统计、回收站、备份、聊天记录）
const SKIP_DIRS: [&str; 7] = ["角色", "大纲", ".summaries", ".stats", ".trash", ".backups", ".chatlog"];

#[tauri::command]
pub async fn scan_mentions(
    app: tauri::AppHandle,
    names: Vec<String>,
) -> Result<Vec<MentionStat>, String> {
    let root = project_root_of(&app).ok_or_else(|| "尚未设置项目目录".to_string())?;
    tauri::async_runtime::spawn_blocking(move || scan_blocking(&root, names))
        .await
        .map_err(|e| e.to_string())?
}

/// 阻塞实现：在阻塞线程池里跑，不占主线程
fn scan_blocking(root: &Path, names: Vec<String>) -> Result<Vec<MentionStat>, String> {
    let mut stats: Vec<MentionStat> = names
        .iter()
        .map(|n| n.trim().to_string())
        .filter(|n| n.chars().count() >= 2 && !n.chars().all(|c| c.is_ascii_digit()))
        .map(|name| MentionStat {
            name,
            count: 0,
            last_file: String::new(),
        })
        .collect();
    if stats.is_empty() {
        return Ok(stats);
    }

    let needles: Vec<String> = stats.iter().map(|s| s.name.to_lowercase()).collect();
    // 每个名字当前「最近一次出现」的 (mtime, 相对路径)
    let mut best: Vec<(u64, String)> = vec![(0, String::new()); stats.len()];

    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    let mut bytes_read: usize = 0;

    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            // 隐藏项与 `_` 前缀（_project.md）不属于正文
            if name.starts_with('.') || name.starts_with('_') {
                continue;
            }
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if !(name.ends_with(".md") || name.ends_with(".txt")) {
                continue;
            }
            if bytes_read > SCAN_MAX_BYTES {
                stack.clear();
                break;
            }

            let Ok(raw) = fs::read(&path) else {
                continue;
            };
            bytes_read += raw.len();
            let text = String::from_utf8_lossy(&raw).to_lowercase();
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            let mtime = path_mtime_secs(&path).unwrap_or(0);

            for (i, needle) in needles.iter().enumerate() {
                if needle.is_empty() {
                    continue;
                }
                let hits = text.matches(needle.as_str()).count();
                if hits == 0 {
                    continue;
                }
                stats[i].count += hits;
                // 「最近」= mtime 最大；相同时间戳时保留先遇到的，避免同秒覆盖抖动
                if best[i].1.is_empty() || mtime > best[i].0 {
                    best[i] = (mtime, rel.clone());
                }
            }
        }
    }

    for (i, slot) in best.into_iter().enumerate() {
        stats[i].last_file = slot.1;
    }
    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// 构造一个临时项目：正文两章 + 角色目录（应被排除）
    fn fixture(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("qingbi-mention-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("角色")).unwrap();
        fs::create_dir_all(root.join("大纲")).unwrap();

        // 第1章：出现两次
        fs::write(root.join("第1章.md"), "张三走了。张三又回来了。").unwrap();
        // 第2章：出现一次，内容更短
        fs::write(root.join("第2章.md"), "张三站在门口。").unwrap();
        // 角色卡里的名字不应参与统计（目录被排除）
        fs::write(root.join("角色").join("张三.md"), "张三 张三 张三").unwrap();
        // _ 前缀与隐藏文件同样排除
        fs::write(root.join("_project.md"), "张三").unwrap();
        root
    }

    /// 追加一个换行以刷新 mtime（Windows 上写 0 字节不会更新 mtime）；
    /// 换行不计入字数，也不影响角色名匹配。
    fn touch(path: &Path) {
        let mut f = fs::OpenOptions::new().append(true).open(path).unwrap();
        f.write_all(b"\n").unwrap();
    }

    #[test]
    fn counts_only_body_files_and_prefers_newest() {
        let root = fixture("count");
        // 让第2章成为"最近修改"
        std::thread::sleep(std::time::Duration::from_millis(1100));
        touch(&root.join("第2章.md"));

        let stats = scan_blocking(&root, vec!["张三".into()]).unwrap();
        assert_eq!(stats.len(), 1);
        // 两章合计 3 次（角色卡与 _project.md 被排除）
        assert_eq!(stats[0].count, 3, "只统计正文，不统计角色卡/项目概述");
        assert_eq!(
            stats[0].last_file, "第2章.md",
            "最近文件应取 mtime 最大的那一章"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn filters_too_short_or_numeric_names() {
        let root = fixture("filter");
        let stats = scan_blocking(&root, vec!["张".into(), "123".into(), "  李四  ".into()]).unwrap();
        // 单字与纯数字被过滤，带空白的名字被 trim 后保留
        let names: Vec<&str> = stats.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["李四"]);
        assert_eq!(stats[0].count, 0);
        assert_eq!(stats[0].last_file, "");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn empty_names_returns_empty() {
        let root = fixture("empty");
        assert!(scan_blocking(&root, vec![]).unwrap().is_empty());
        let _ = fs::remove_dir_all(&root);
    }
}
