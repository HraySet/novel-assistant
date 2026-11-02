//! 与操作系统交互的能力：在文件管理器中定位、外部拖放开关、原生拖出。
//!
//! 几个刻意的「不沙箱」决定（都写了理由，改动前先读）：
//! - `reveal_path`：需要在「最近项目」所在文件夹打开资源管理器，路径可能在项目外；
//!   该命令只触发系统 UI，不回传任何数据给 WebView。
//! - `path_exists`：只返回布尔值、不回传内容，项目库要靠它检查失效路径。
//! - 导出目标同理（见 export.rs）。

use std::path::Path;

/// 在系统文件管理器中定位文件/目录（跨平台尽力而为）
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
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

/// 仅返回存在性、不回传任何内容；「最近项目」列表需要检查非当前项目文件夹，故不做项目沙箱。
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// 打开 WebView2 的外部拖放开关（AllowExternalDrop 默认关闭）。
/// 关闭时：资源管理器的文件无法拖入应用，且我们自己的原生拖拽也无法落回
/// 应用内（内部移动失效）。打开后两类拖入都走 HTML5 drop 事件正常处理。
#[tauri::command]
pub fn enable_external_drop(webview: tauri::Webview) -> Result<(), String> {
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
pub async fn drag_out_files(app: tauri::AppHandle, paths: Vec<String>) -> Result<u32, String> {
    #[cfg(windows)]
    {
        // 防御：无论前端传了什么，只拖第一个（单文件语义）
        // 路径沙箱：仅允许拖出项目内文件，非法路径静默丢弃（前端只传文件树里的路径）
        let paths: Vec<String> = paths
            .into_iter()
            .take(1)
            .filter_map(|p| {
                crate::paths::resolve_in_project(&app, &p)
                    .ok()
                    .map(|pb| pb.to_string_lossy().to_string())
            })
            .collect();
        if paths.is_empty() {
            return Ok(0);
        }
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let result = crate::native_drag::run_drag(paths);
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (app, paths);
        Err("原生拖放仅支持 Windows".to_string())
    }
}
