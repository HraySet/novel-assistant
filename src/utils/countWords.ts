/**
 * 统计中英文混排文本字数，与 Rust 端 count_words 逻辑保持一致：
 * 每个 CJK 字符计 1 字，英文/数字按连续词计 1 字。
 */

function isCjkChar(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK 统一表意文字
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK 扩展 A
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK 兼容表意文字
    (codePoint >= 0x3000 && codePoint <= 0x303f) || // CJK 标点
    (codePoint >= 0xff00 && codePoint <= 0xffef) || // 全角形式
    (codePoint >= 0x2e80 && codePoint <= 0x2eff) || // CJK 部首补充
    (codePoint >= 0x31c0 && codePoint <= 0x31ef) // CJK 笔画
  )
}

function isAlphanumeric(ch: string): boolean {
  // 对应 Rust 的 char::is_alphanumeric（Unicode 字母或数字）
  return /[\p{L}\p{N}]/u.test(ch)
}

export function countWords(text: string): number {
  let count = 0
  let inWord = false
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (isCjkChar(cp)) {
      count++
      inWord = false
    } else if (isAlphanumeric(ch)) {
      if (!inWord) {
        count++
        inWord = true
      }
    } else {
      inWord = false
    }
  }
  return count
}
