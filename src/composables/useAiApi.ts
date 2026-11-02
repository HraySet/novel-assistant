/**
 * AI 请求头构建。
 *
 * 关键约束：**必须由调用方显式传入服务商与密钥**。
 * 旧实现无参、内部现读全局 settings store，导致 streamChat 的 `apiKey` 形参
 * 完全没用上——一旦出现「用 A 的配置发请求、期间用户切到 B」或多模型对比，
 * 就会带着 B 的密钥去请求 A 的端点。现在签名强制参数化，读全局的责任回到调用方。
 */

export type AiProvider = 'openai' | 'claude' | 'deepseek'

export function buildAiHeaders(
  provider: AiProvider | string,
  apiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (provider === 'claude') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
  }
  return headers
}
