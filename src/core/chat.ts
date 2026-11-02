/**
 * 对话历史裁剪。
 *
 * 为什么必须有：发送请求时会把整个会话历史一起带上。长对话（或贴了大段正文）
 * 会让输入 token 线性膨胀，既费钱又可能超出模型上下文窗口，
 * 与「日常写作零 token、按需小调用」的产品定位直接矛盾。
 *
 * 规则：**保留最近的**，从最旧的一端丢弃；单条超预算时仍然保留它，
 * 否则会出现「为了省钱把用户这次的问题也丢了」的荒谬结果。
 */

export interface ChatTurn {
  role: string
  content: string
}

export interface TrimOptions {
  /** 最多保留多少条，默认 12 */
  maxTurns?: number
  /** 历史总字符上限，默认 12000 */
  maxChars?: number
}

export function trimHistory<T extends ChatTurn>(history: T[], opts: TrimOptions = {}): T[] {
  const maxTurns = opts.maxTurns ?? 12
  const maxChars = opts.maxChars ?? 12000
  if (history.length === 0) return []

  const recent = history.slice(-maxTurns)
  let total = 0
  let start = recent.length

  for (let i = recent.length - 1; i >= 0; i--) {
    const len = recent[i].content.length
    const isLast = start === recent.length
    // 已装入若干条后再超预算就停；最后一条无论如何都保留
    if (!isLast && total + len > maxChars) break
    total += len
    start = i
  }

  return recent.slice(start)
}
