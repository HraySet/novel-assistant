import { describe, it, expect } from 'vitest'
import { buildAiHeaders } from './useAiApi'

/**
 * 请求头必须完全由入参决定。
 * 回归点：旧实现无参、内部现读全局 store，streamChat 的 apiKey 形参形同虚设，
 * 换服务商/多模型场景会串用密钥。
 */
describe('buildAiHeaders', () => {
  it('Claude 用 x-api-key + anthropic-version', () => {
    const h = buildAiHeaders('claude', 'sk-ant')
    expect(h['x-api-key']).toBe('sk-ant')
    expect(h['anthropic-version']).toBe('2023-06-01')
    expect(h['Authorization']).toBeUndefined()
  })

  it.each(['openai', 'deepseek'] as const)('%s 用 Bearer 授权', (provider) => {
    const h = buildAiHeaders(provider, 'sk-123')
    expect(h['Authorization']).toBe('Bearer sk-123')
    expect(h['x-api-key']).toBeUndefined()
  })

  it('始终带 Content-Type', () => {
    expect(buildAiHeaders('openai', 'k')['Content-Type']).toBe('application/json')
    expect(buildAiHeaders('claude', 'k')['Content-Type']).toBe('application/json')
  })

  it('密钥取自入参而非全局状态（同为 claude，不同 key 产生不同头）', () => {
    expect(buildAiHeaders('claude', 'a')['x-api-key']).toBe('a')
    expect(buildAiHeaders('claude', 'b')['x-api-key']).toBe('b')
  })

  it('空密钥也照常构建（由调用方决定是否阻止请求）', () => {
    expect(buildAiHeaders('openai', '')['Authorization']).toBe('Bearer ')
  })
})
