/**
 * AI API 请求构建工具。
 * 流式请求统一走 useAiStream.ts；这里只保留公共的请求头构建。
 */
import { useSettingsStore } from "../stores/settings";

/** 根据 AI 服务商构建请求头 */
export function buildAiHeaders(): Record<string, string> {
  const s = useSettingsStore();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (s.aiProvider === "claude") {
    headers["x-api-key"] = s.aiApiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${s.aiApiKey}`;
  }
  return headers;
}
