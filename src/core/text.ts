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
