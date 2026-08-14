/**
 * AI API 调用工具函数。
 * 将 CharacterPanel / ChatPanel / EditorPanel 中重复的请求构建和解析逻辑集中到此。
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

export function isClaudeProvider(): boolean {
  return useSettingsStore().aiProvider === "claude";
}

export function getAiEndpoint(): string {
  return useSettingsStore().aiEndpoint;
}

export function getAiModel(): string {
  return useSettingsStore().aiModel;
}

export function getAiApiKey(): string {
  return useSettingsStore().aiApiKey;
}

/** 从 SSE chunk 中提取 token 文本 */
export function parseStreamToken(data: any, isClaude: boolean): string {
  if (isClaude) {
    if (data.type === "content_block_delta") return data.delta?.text ?? "";
    if (data.type === "content_block_start") return data.content_block?.text ?? "";
  }
  return data.choices?.[0]?.delta?.content ?? "";
}

/** 从非流式响应中提取完整文本 */
export function parseResponseText(data: any, isClaude: boolean): string {
  if (isClaude) return data?.content?.[0]?.text ?? "";
  return data?.choices?.[0]?.message?.content ?? "";
}
