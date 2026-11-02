//! 导出：合并为纯文本 / Markdown / EPUB3。
//!
//! 源文件必须过项目沙箱；导出目标是用户在保存对话框里选的位置，
//! 允许位于项目外（刻意豁免，且只写这一个文件）。

use crate::paths::resolve_in_project;
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn export_project(
    app: tauri::AppHandle,
    paths: Vec<String>,
    dest_path: String,
    with_titles: bool,
) -> Result<(), String> {
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

// ── EPUB3 ──

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
pub fn export_epub(
    app: tauri::AppHandle,
    paths: Vec<String>,
    dest_path: String,
    title: String,
) -> Result<(), String> {
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
