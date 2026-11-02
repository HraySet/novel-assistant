//! AI 配置与密钥。
//!
//! 密钥**不落磁盘**：存在系统钥匙串（Windows 凭据管理器 / macOS Keychain），
//! config.json 里只保留服务商、模型、接口地址等非敏感字段。

use crate::config::{read_config, write_config};
use serde_json::Value;

#[tauri::command]
pub fn get_ai_config(app: tauri::AppHandle) -> Result<Value, String> {
    let config = read_config(&app)?;
    Ok(config.get("ai").cloned().unwrap_or(serde_json::json!({})))
}

#[tauri::command]
pub fn save_ai_config(app: tauri::AppHandle, ai_config: Value) -> Result<(), String> {
    let mut config = read_config(&app)?;
    // 剥离明文密钥：密钥改存系统钥匙串（get/set_api_key），config.json 只留非敏感配置
    config["ai"] = strip_api_keys(ai_config);
    write_config(&app, &config)
}

/// 递归删除 configs.*.apiKey（兼容旧格式单 provider 的顶层 apiKey）
fn strip_api_keys(mut value: Value) -> Value {
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

/// 钥匙串服务名。
///
/// ⚠️ 与 Cargo.toml 的 package name 保持一致（`yanyan`）。**不要随手改成产品名**：
/// 服务名是凭据条目的定位键，改了等于让所有用户已保存的 API Key 失联。
/// 若将来确实要改名，必须先做双读迁移：先用新名读，读不到回退旧名，成功后回写新名。
const KEYRING_SERVICE: &str = "yanyan";

/// 从系统钥匙串读取某服务商的 API Key；未保存/读取失败返回 None
#[tauri::command]
pub fn get_api_key(provider: String) -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, &provider)
        .ok()?
        .get_password()
        .ok()
}

/// 把 API Key 写入系统钥匙串；传空串表示删除已保存的密钥
#[tauri::command]
pub fn set_api_key(provider: String, api_key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &provider).map_err(|e| e.to_string())?;
    if api_key.trim().is_empty() {
        // 删除失败（无条目/平台不支持）当作已清除，不阻塞保存流程
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry.set_password(&api_key).map_err(|e| e.to_string())
}
