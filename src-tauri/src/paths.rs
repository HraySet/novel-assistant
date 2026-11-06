//! 路径沙箱与路径工具。
//!
//! 这是整个后端的**安全边界**：所有来自前端的路径都必须先过
//! `resolve_in_project` / `resolve_within`，越界一律返回 Err（fail closed）。
//! 前端的 `core/paths.ts` 是它的镜像——两边对「同一个路径」的规范化理解必须一致。

use crate::config::read_config;
use std::path::{Path, PathBuf};

/// 项目根目录（来自 config，已规范化解析符号链接）；未设置/不可用时返回 None
pub fn project_root_of(app: &tauri::AppHandle) -> Option<PathBuf> {
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
pub fn resolve_within(root: &Path, path: &str) -> Result<PathBuf, String> {
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
pub fn resolve_in_project(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let root = project_root_of(app).ok_or_else(|| "尚未设置项目目录".to_string())?;
    resolve_within(&root, path)
}

/// 排除隐藏文件、备份和回收站目录
pub fn should_skip(name: &str) -> bool {
    name.starts_with('.') || name == ".backups" || name == ".trash" || name == ".chatlog"
}

/// 路径中是否含隐藏组件（.stats / .chatlog / .backups 等元数据目录）
pub fn has_hidden_component(path: &Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s.starts_with('.') && s != "." && s != ".."
    })
}

/// 校验文件名组件：剔除 Windows 非法字符，拒绝空、"."、".."
pub fn sanitize_component(name: &str) -> Option<String> {
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
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
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

/// 文件修改时间（秒）
pub fn path_mtime_secs(path: &Path) -> Option<u64> {
    path.metadata()
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

/// JS `encodeURIComponent` 的等价实现（UTF-8 百分号编码）。
///
/// 保留集 `A-Za-z0-9-_.!~*'()` 不编码；其余字符按其 UTF-8 字节序列编码为 `%XX`。
/// 必须与前端 `encodeURIComponent` **逐字节一致**，否则撤销历史文件（.stats/undo/*.json）
/// 在两端算出不同文件名，前端读不回。测试向量见 paths.rs `mod tests` 的
/// `encode_uri_component_matches_js`（与 REBUILD-MODULE-backup.md §2.3 逐字符对齐向量表一致）。
///
/// 最易误编的是 `! ~ * ' ( )` 六个字符——标准库没有等价物，手写循环几乎必然把 `'`
/// 编成 `%27`、把 `*` 编成 `%2A`。这里显式列出完整保留集，避免踩坑。
pub fn encode_uri_component(input: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut out = String::with_capacity(input.len() * 3);
    for &b in input.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~'
            | b'*' | b'\'' | b'(' | b')' => out.push(b as char),
            _ => {
                out.push('%');
                out.push(HEX[(b >> 4) as usize] as char);
                out.push(HEX[(b & 0x0F) as usize] as char);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_root(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("qingbi-paths-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("第一卷")).unwrap();
        fs::write(root.join("第一卷").join("第1章.md"), "x").unwrap();
        root.canonicalize().unwrap()
    }

    #[test]
    fn allows_existing_file_inside_root() {
        let root = temp_root("inside");
        let p = resolve_within(&root, "第一卷/第1章.md").expect("应允许项目内文件");
        assert!(p.starts_with(&root));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn allows_nonexistent_child_path() {
        // 新建文件/目录时目标尚不存在，必须能通过校验
        let root = temp_root("newfile");
        let p = resolve_within(&root, "第二卷/第9章.md").expect("应允许项目内新路径");
        assert!(p.starts_with(&root));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_parent_escape() {
        let root = temp_root("escape");
        assert!(resolve_within(&root, "../outside.md").is_err(), "越界必须失败");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_absolute_path_outside_root() {
        let root = temp_root("abs");
        let outside = std::env::temp_dir().join(format!("qingbi-outside-{}.md", std::process::id()));
        fs::write(&outside, "x").unwrap();
        assert!(
            resolve_within(&root, &outside.to_string_lossy()).is_err(),
            "项目外绝对路径必须失败"
        );
        let _ = fs::remove_file(&outside);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_empty_path() {
        let root = temp_root("empty");
        assert!(resolve_within(&root, "   ").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn sanitize_component_strips_illegal_chars() {
        assert_eq!(sanitize_component("a:b*c?.md"), Some("abc.md".to_string()));
        assert_eq!(sanitize_component("  第1章  "), Some("第1章".to_string()));
        assert_eq!(sanitize_component(".."), None);
        assert_eq!(sanitize_component("."), None);
        assert_eq!(sanitize_component("   "), None);
    }

    #[test]
    fn unique_path_appends_index() {
        let dir = std::env::temp_dir().join(format!("qingbi-unique-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("第1章.md"), "x").unwrap();

        let p = unique_path(&dir, "第1章.md");
        assert_eq!(p.file_name().unwrap().to_string_lossy(), "第1章 (2).md");

        fs::write(&p, "y").unwrap();
        let p3 = unique_path(&dir, "第1章.md");
        assert_eq!(p3.file_name().unwrap().to_string_lossy(), "第1章 (3).md");

        let _ = fs::remove_dir_all(&dir);
    }

    // ── encode_uri_component 逐字符对齐向量（与 REBUILD-MODULE-backup.md §2.3 一致）──
    // 这是撤销历史文件名的「定稿锚点」：Rust 与前端 encodeURIComponent 逐字节一致。
    #[test]
    fn encode_uri_component_matches_js_reserved_set() {
        // 保留集不编码
        assert_eq!(encode_uri_component("azAZ09-_.!~*'()"), "azAZ09-_.!~*'()");
        // 六字符单独锁定（最易误编）
        assert_eq!(encode_uri_component("!"), "!");
        assert_eq!(encode_uri_component("~"), "~");
        assert_eq!(encode_uri_component("*"), "*");
        assert_eq!(encode_uri_component("'"), "'");
        assert_eq!(encode_uri_component("("), "(");
        assert_eq!(encode_uri_component(")"), ")");
    }

    #[test]
    fn encode_uri_component_matches_js_escapes() {
        assert_eq!(encode_uri_component(" "), "%20");
        assert_eq!(encode_uri_component("\\"), "%5C");
        assert_eq!(encode_uri_component("/"), "%2F");
        assert_eq!(encode_uri_component(":"), "%3A");
        // 中文（UTF-8 多字节）
        assert_eq!(encode_uri_component("中"), "%E4%B8%AD");
        assert_eq!(encode_uri_component("文"), "%E6%96%87");
        // emoji（4 字节 UTF-8）
        assert_eq!(encode_uri_component("😀"), "%F0%9F%98%80");
    }

    #[test]
    fn encode_uri_component_matches_js_undo_filename() {
        // 与前端 undoFileName 的定稿锚点一致
        assert_eq!(encode_uri_component("第1章.md"), "%E7%AC%AC1%E7%AB%A0.md");
        assert_eq!(
            encode_uri_component("卷1/第2章.md"),
            "%E5%8D%B71%2F%E7%AC%AC2%E7%AB%A0.md"
        );
        assert_eq!(encode_uri_component("a b.md"), "a%20b.md.json".trim_end_matches(".json"));
    }
}
