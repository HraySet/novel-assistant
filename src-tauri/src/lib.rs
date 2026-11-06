//! 意笔后端入口。
//!
//! 模块划分（依赖自上而下，不要反向）：
//! ```text
//! lib.rs       仅声明模块 + 注册命令
//! ├─ platform  系统交互（定位/拖放）
//! ├─ export    导出（txt/md/epub）
//! ├─ mention   角色出场统计
//! ├─ trash     回收站
//! ├─ fs_ops    文件读写 + 字数缓存
//! ├─ ai        AI 配置与系统钥匙串
//! ├─ backup    版本备份
//! ├─ paths     路径沙箱与路径工具
//! ├─ config    config.json 读写
//! └─ types     共享数据结构
//! ```
//! 拆分前这里是 1465 行的单文件；命令名与参数保持完全不变，
//! 前端 `api/files.ts` 无需任何改动。

mod ai;
mod backup;
mod config;
mod export;
mod fs_ops;
mod mention;
#[cfg(windows)]
mod native_drag;
mod paths;
mod platform;
mod trash;
mod types;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // 项目与索引
            config::get_project_path,
            config::set_project_path,
            config::get_project_index,
            config::save_project_index,
            // 文件
            fs_ops::list_dir,
            fs_ops::read_file,
            fs_ops::read_file_tail,
            fs_ops::write_file,
            fs_ops::create_dir,
            fs_ops::create_file,
            fs_ops::delete_file,
            fs_ops::move_path,
            fs_ops::rename_path,
            fs_ops::file_mtime,
            fs_ops::import_files,
            // 回收站
            trash::delete_path,
            trash::list_trash,
            trash::restore_trash,
            trash::empty_trash,
            // 备份
            backup::list_backups,
            // AI 配置与密钥
            ai::get_ai_config,
            ai::save_ai_config,
            ai::get_api_key,
            ai::set_api_key,
            // 导出
            export::export_project,
            export::export_epub,
            // 统计与平台能力
            mention::scan_mentions,
            platform::reveal_path,
            platform::path_exists,
            platform::drag_out_files,
            platform::enable_external_drop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
