/**
 * 文本处理的纯函数集合。
 *
 * 这里的东西必须无副作用、无依赖：它们服务于「写回用户文件」这类高风险动作，
 * 出错代价是稿子被改坏，因此每一条都要有测试钉住。
 */

/**
 * 只替换第一处匹配。
 *
 * 为什么不用 `text.split(find).join(repl)`：旧实现用全量替换，当同一句设定/标题
 * 在文件里出现两次（开头一段 + 关系段一段是常见写法）时会被**全部**改掉，
 * 用户只确认了「这一处」。
 */
export function replaceFirst(text: string, find: string, replacement: string): string {
  if (!find) return text
  const idx = text.indexOf(find)
  if (idx < 0) return text
  return text.slice(0, idx) + replacement + text.slice(idx + find.length)
}

/** 按字符数截断，超出时追加省略标记（用于提示词预算，不用于写回文件） */
export function truncateWithEllipsis(text: string, max: number): string {
  if (max <= 0) return ''
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

/** 取文本末尾 n 个字符（散文场景的章尾片段） */
export function tailChars(text: string, n: number): string {
  if (n <= 0) return ''
  return text.length <= n ? text : text.slice(-n)
}

/** 去掉 Markdown 标题标记与首尾空白，得到一行可读标题 */
export function cleanHeadingLine(line: string): string {
  return line.replace(/^#{1,6}\s*/, '').trim()
}

/**
 * 清洗成合法文件名：去掉 Windows/macOS 都不允许的字符，压缩空白，限制长度。
 *
 * 两条改名入口（编辑器标题栏、文件树重命名）必须用同一份规则——
 * 此前只有标题栏会清洗，文件树里输入 `第1章:开端` 会直接报「重命名失败」。
 */
export function sanitizeFileName(input: string): string {
  return input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows 上文件名不能以点或空格结尾
    .replace(/[. ]+$/, '')
    .slice(0, 80)
}

// ── 章节名自然排序（含中文数字）──────────────────────────────────

const CN_DIGIT: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

function isCnNumeral(ch: string): boolean {
  return ch in CN_DIGIT || ch in CN_UNIT
}

/**
 * 解析中文数字（1 ~ 9999）：十一 → 11，二十三 → 23，一百零五 → 105。
 * 解析不了返回 null（调用方按普通文本处理）。
 */
export function parseChineseNumber(text: string): number | null {
  if (!text) return null
  let section = 0
  let number = 0
  let seen = false
  for (const ch of text) {
    if (ch in CN_DIGIT) {
      number = CN_DIGIT[ch]
      seen = true
    } else if (ch in CN_UNIT) {
      const unit = CN_UNIT[ch]
      // 「十一」的「十」前面没有数字，按 1 计
      section += (number === 0 ? 1 : number) * unit
      number = 0
      seen = true
    } else {
      return null
    }
  }
  return seen ? section + number : null
}

type SortToken = string | number

/**
 * 把名字切成「文本 / 数字」交替的序列，作为排序键。
 *
 * 关键作用：`第1章` 与 `第一章` 产生**相同**的键 ['第', 1, '章']，
 * 于是阿拉伯数字与中文数字可以混排，且都按数值比较。
 */
export function chapterSortKey(name: string): SortToken[] {
  const out: SortToken[] = []
  let buf = ''
  let i = 0
  while (i < name.length) {
    const ch = name[i]
    if (ch >= '0' && ch <= '9') {
      if (buf) { out.push(buf); buf = '' }
      let digits = ''
      while (i < name.length && name[i] >= '0' && name[i] <= '9') { digits += name[i]; i++ }
      out.push(Number(digits))
      continue
    }
    if (isCnNumeral(ch)) {
      const start = i
      let cn = ''
      while (i < name.length && isCnNumeral(name[i])) { cn += name[i]; i++ }
      const value = parseChineseNumber(cn)
      if (value !== null) {
        if (buf) { out.push(buf); buf = '' }
        out.push(value)
      } else {
        buf += name.slice(start, i)
      }
      continue
    }
    buf += ch
    i++
  }
  if (buf) out.push(buf)
  return out
}

let _collator: Intl.Collator | null = null
function collator(): Intl.Collator {
  if (!_collator) _collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
  return _collator
}

/**
 * 章节名/目录名比较：数字段按数值、文本段按中文排序。
 *
 * 用于替代直接 `Intl.Collator` 比较——后者只认阿拉伯数字，
 * 「第一章 / 第二章 / 第十章」会按拼音排成一团乱序（第二十 二 三 十一 十 一）。
 */
export function compareChapterNames(a: string, b: string): number {
  const ka = chapterSortKey(a)
  const kb = chapterSortKey(b)
  const n = Math.min(ka.length, kb.length)
  for (let i = 0; i < n; i++) {
    const x = ka[i]
    const y = kb[i]
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y
    } else if (typeof x === 'string' && typeof y === 'string') {
      const c = collator().compare(x, y)
      if (c !== 0) return c
    } else {
      // 数字段排在文本段之前（第1章 在 第X章之前）
      return typeof x === 'number' ? -1 : 1
    }
  }
  return ka.length - kb.length
}
