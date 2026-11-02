/**
 * AI 用量账本（只记当天）。
 *
 * 产品上只要求「看见今天用了多少」：没有月度报表、没有按项目拆分。
 * 因此这里只维护一条当日记录，跨天自动归零。
 *
 * 数据来源是服务商返回的 `usage` 字段：
 * - OpenAI 兼容：需请求 `stream_options.include_usage`，最后一个分片带 usage；
 * - Claude：`message_start` 给 input_tokens，`message_delta` 给累计 output_tokens。
 *
 * 服务商没返回 usage（部分代理/自建网关会丢）时**不要编造**：调用次数照记，
 * token 保持 0，UI 上显示「未返回用量」。
 */

export interface AiUsage {
  /** 输入（提示词）token */
  input: number
  /** 输出（生成）token */
  output: number
}

export interface DailyUsage {
  /** 本地日期 YYYY-MM-DD */
  date: string
  /** 当日调用次数 */
  calls: number
  input: number
  output: number
  /** 有多少次调用没拿到 usage（用于 UI 上如实说明） */
  missing: number
}

export const EMPTY_USAGE: AiUsage = { input: 0, output: 0 }

/** 本地日期键（与统计的 dailyRecords 同一口径） */
export function todayKey(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export function emptyDaily(date: string): DailyUsage {
  return { date, calls: 0, input: 0, output: 0, missing: 0 }
}

/**
 * 把一次调用并入当日账本：跨天先归零，再累加。
 *
 * usage 为空（服务商未返回）时只增调用次数与 missing 计数，绝不估算 token。
 */
export function mergeDailyUsage(prev: DailyUsage | null, usage: AiUsage | null, today: string): DailyUsage {
  const base = prev && prev.date === today ? prev : emptyDaily(today)
  const hasUsage = !!usage && (usage.input > 0 || usage.output > 0)
  return {
    date: today,
    calls: base.calls + 1,
    input: base.input + (hasUsage ? usage!.input : 0),
    output: base.output + (hasUsage ? usage!.output : 0),
    missing: base.missing + (hasUsage ? 0 : 1),
  }
}

/** 紧凑数字：1234 → 1.2k，1234567 → 1.2M */
export function formatTokens(n: number): string {
  if (n <= 0) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const v = n / 1000
    return `${v < 10 ? v.toFixed(1) : Math.round(v)}k`
  }
  const v = n / 1_000_000
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}M`
}

/** 给 UI 用的一句话：今天 3 次调用 · 输入 1.2k / 输出 800 */
export function describeDailyUsage(d: DailyUsage): string {
  if (d.calls === 0) return '今天还没有调用 AI'
  const total = formatTokens(d.input + d.output)
  if (d.input === 0 && d.output === 0) {
    return `今天 ${d.calls} 次调用 · 服务商未返回用量`
  }
  const partial = d.missing > 0 ? `（${d.missing} 次未返回用量）` : ''
  return `今天 ${d.calls} 次调用 · 共 ${total} tokens（输入 ${formatTokens(d.input)} / 输出 ${formatTokens(d.output)}）${partial}`
}
