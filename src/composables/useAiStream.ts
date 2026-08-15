import { buildAiHeaders } from './useAiApi'

export type AiErrorKind =
  | 'unauthorized'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'timeout'
  | 'bad_response'

export class AiRequestError extends Error {
  kind: AiErrorKind
  status?: number
  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'AiRequestError'
    this.kind = kind
    this.status = status
  }
}

export interface AiStreamRequest {
  provider: 'openai' | 'claude' | 'deepseek'
  endpoint: string
  apiKey: string
  model: string
  system?: string
  /** 采样温度（0-2），不传则用服务商默认 */
  temperature?: number
  messages: { role: string; content: string }[]
  signal?: AbortSignal
  /** 收到响应前的最长等待（毫秒），默认 60s */
  connectTimeoutMs?: number
  /** 两个流式分片之间的最长等待（毫秒），默认 45s */
  idleTimeoutMs?: number
  /** 每收到一批文本时回调（参数为累计全文） */
  onToken: (fullText: string) => void
}

export interface AiStreamResult {
  text: string
  /** 是否被用户/外部中止（此时 text 为已生成的部分） */
  aborted: boolean
}

function friendlyMessage(kind: AiErrorKind, status?: number, detail?: string): string {
  const base: Record<AiErrorKind, string> = {
    unauthorized: 'API Key 无效或没有权限（401）',
    rate_limited: '请求太频繁，被限流了（429），稍等几秒再试',
    server: `服务商暂时不可用（${status ?? '5xx'}），稍后再试`,
    network: '网络连接失败，请检查网络或接口地址',
    timeout: '请求超时：服务商响应太慢或网络不稳定',
    bad_response: `请求失败（${status ?? '未知'}）`,
  }
  let msg = base[kind]
  if (detail) msg += `：${detail}`
  return msg
}

/** 从 SSE 分片里提取文本增量 */
function parseSseChunk(data: unknown, isClaude: boolean): string {
  if (isClaude) {
    const d = data as { type?: string; delta?: { text?: string } }
    if (d.type === 'content_block_delta') return d.delta?.text ?? ''
    return ''
  }
  const d = data as { choices?: { delta?: { content?: string } }[] }
  return d.choices?.[0]?.delta?.content ?? ''
}

/** 读取错误响应体里的详情（截断） */
async function readErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text()
    try {
      const obj = JSON.parse(text)
      const m = obj?.error?.message || obj?.message
      if (typeof m === 'string' && m) return m.slice(0, 200)
    } catch { /* 非 JSON */ }
    const trimmed = text.slice(0, 300).replace(/\s+/g, ' ').trim()
    return trimmed || undefined
  } catch {
    return undefined
  }
}

/**
 * 统一流式请求引擎：两个 AI 面板共用。
 * - 自动处理 Claude / OpenAI 兼容（DeepSeek）两种格式
 * - 连接超时 + 流式空闲超时
 * - 401/429/5xx/网络错误分类为友好中文提示
 * - 429 且尚未生成内容时自动重试一次（2s 后）
 * - 外部 abort（停止按钮/切换文件）返回已生成的部分文本
 */
export async function streamChat(req: AiStreamRequest): Promise<AiStreamResult> {
  if (req.signal?.aborted) return { text: '', aborted: true }

  const isClaude = req.provider === 'claude'
  const endpoint = req.endpoint.replace(/\/+$/, '')
  const url = isClaude ? `${endpoint}/messages` : `${endpoint}/chat/completions`

  const body = isClaude
    ? {
        model: req.model,
        max_tokens: 4096,
        temperature: req.temperature ?? 0.8,
        system: req.system || undefined,
        messages: req.messages,
        stream: true,
      }
    : {
        model: req.model,
        temperature: req.temperature ?? 0.8,
        max_tokens: 4096,
        messages: [
          ...(req.system ? [{ role: 'system', content: req.system }] : []),
          ...req.messages,
        ],
        stream: true,
      }

  const maxAttempts = 2
  let attempt = 0

  while (true) {
    attempt++
    const internal = new AbortController()
    const onExternalAbort = () => internal.abort()
    req.signal?.addEventListener('abort', onExternalAbort)

    let connectTimer: ReturnType<typeof setTimeout> | null = null
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const clearTimers = () => {
      if (connectTimer) clearTimeout(connectTimer)
      if (idleTimer) clearTimeout(idleTimer)
      connectTimer = null
      idleTimer = null
    }
    const refreshIdle = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => internal.abort(), req.idleTimeoutMs ?? 45000)
    }
    connectTimer = setTimeout(() => internal.abort(), req.connectTimeoutMs ?? 60000)

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: buildAiHeaders(),
        body: JSON.stringify(body),
        signal: internal.signal,
      })
    } catch (e: any) {
      clearTimers()
      req.signal?.removeEventListener('abort', onExternalAbort)
      if (req.signal?.aborted) return { text: '', aborted: true }
      const timedOut = e?.name === 'AbortError'
      throw new AiRequestError(timedOut ? 'timeout' : 'network', friendlyMessage(timedOut ? 'timeout' : 'network'))
    }
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null }

    if (!res.ok) {
      const detail = await readErrorDetail(res)
      clearTimers()
      req.signal?.removeEventListener('abort', onExternalAbort)
      const kind: AiErrorKind =
        res.status === 401 || res.status === 403
          ? 'unauthorized'
          : res.status === 429
            ? 'rate_limited'
            : res.status >= 500
              ? 'server'
              : 'bad_response'
      // 429 且还没生成任何内容 → 等待 2s 重试一次
      if (kind === 'rate_limited' && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 2000))
        if (req.signal?.aborted) return { text: '', aborted: true }
        continue
      }
      throw new AiRequestError(kind, friendlyMessage(kind, res.status, detail), res.status)
    }

    const reader = res.body?.getReader()
    if (!reader) {
      clearTimers()
      req.signal?.removeEventListener('abort', onExternalAbort)
      throw new AiRequestError('bad_response', friendlyMessage('bad_response', res.status, '无法读取响应流'), res.status)
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let result = ''
    let finished = false
    refreshIdle()

    const processLine = (line: string) => {
      if (!line.startsWith('data:')) return
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const chunk = parseSseChunk(JSON.parse(payload), isClaude)
        if (chunk) {
          result += chunk
          req.onToken(result)
        }
      } catch { /* 非 JSON 行跳过 */ }
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) processLine(line)
        refreshIdle()
      }
      // 收尾：处理缓冲区里最后一行
      if (buffer.trim()) processLine(buffer)
      finished = true
    } catch (e: any) {
      clearTimers()
      req.signal?.removeEventListener('abort', onExternalAbort)
      if (req.signal?.aborted) return { text: result, aborted: true }
      if (e?.name === 'AbortError') {
        throw new AiRequestError('timeout', friendlyMessage('timeout'))
      }
      // 其它流读取异常：保留已生成内容
      return { text: result, aborted: false }
    }

    clearTimers()
    req.signal?.removeEventListener('abort', onExternalAbort)
    if (finished) return { text: result, aborted: false }
  }
}
