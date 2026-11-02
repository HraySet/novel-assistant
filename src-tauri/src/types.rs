//! 跨模块共享的数据结构。
//!
//! 全部序列化结构都显式声明 `rename_all = "camelCase"`：
//! Tauri 不会自动转换字段名，前端 `api/files.ts` 的接口按 camelCase 定义，
//! 漏掉这个属性会让前端拿到 undefined（历史上 MentionStat 就漏了，
//! 导致角色卡渲染「最近 XX」时抛 TypeError）。

use serde::{Deserialize, Serialize};

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

/// 角色出场统计
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MentionStat {
    pub name: String,
    pub count: usize,
    /// 最近一次出现的正文文件（相对项目根，正斜杠分隔）
    pub last_file: String,
}
