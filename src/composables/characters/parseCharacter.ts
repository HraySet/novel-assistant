/**
 * 角色卡内容的纯函数解析：角色类型提取、卡片摘要、AI 名字数组容错解析。
 *
 * 从 CharacterCards.vue 下沉。三个函数都无副作用、无依赖（不碰 store/api/Vue），
 * 可独立在 node 里跑测试。
 */

/**
 * 从"定位"字段提取角色类型，用于列表标签与配色。
 * 匹配 `定位：xxx` / `定位: xxx`，截取前 6 个字；无定位字段时回退「角色」。
 */
export function detectRole(content: string): string {
  const line = content.split('\n').find((l) => l.includes('定位'))
  if (line) {
    const m = line.match(/定位[：:]\s*(.+)/)
    if (m) return m[1].trim().slice(0, 6)
  }
  return '角色'
}

/**
 * 卡片预览：取第一行非标题、非「定位」行的有效文本，截前 60 字。
 * 空内容回退「（空）」。
 */
export function preview(content: string): string {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('- 定位'))
  return lines[0]?.slice(0, 60) ?? '（空）'
}

/**
 * 容错解析 AI 返回的名字数组（只取第一个 `[` 到最后一个 `]` 之间的 JSON）。
 * 过滤规则：只留 2-12 字、非纯数字/空白的中文/字符名。
 */
export function parseNameList(text: string): string[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try {
    const arr = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => typeof x === 'string')
      .map((x) => x.trim())
      .filter((n) => n.length >= 2 && n.length <= 12 && !/^[\d\s]+$/.test(n))
  } catch {
    return []
  }
}
