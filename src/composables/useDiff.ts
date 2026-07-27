/**
 * 行级 + 字级双层 Diff。
 * - 行级 LCS：识别整体增删改
 * - 字级 LCS：在"被替换"的 remove/add 行对上做字符粒度标注，润色场景精准高亮
 */

export interface CharSpan {
  type: 'normal' | 'add' | 'remove'
  text: string
}

export interface DiffLine {
  type: 'add' | 'remove' | 'equal'
  content: string
  oldLine?: number
  newLine?: number
  /** 字级高亮片段（仅 add/remove 行有值） */
  chars?: CharSpan[]
}

/** 行级 LCS DP 表 */
function computeLCS<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): number[][] {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = eq(a[i - 1], b[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp
}

/** 从 DP 表回溯差异序列（push 后 reverse，不用 unshift） */
function backtrack<T>(a: T[], b: T[], dp: number[][], makeResult: (type: 'add' | 'remove' | 'equal', i: number, j: number) => T): T[] {
  const result: T[] = []
  let i = a.length, j = b.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push(makeResult('equal', i - 1, j - 1)); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push(makeResult('add', i - 1, j - 1)); j--
    } else {
      result.push(makeResult('remove', i - 1, j - 1)); i--
    }
  }
  result.reverse()
  return result
}

/** 字级 LCS，返回字符片段 */
function charDiff(oldStr: string, newStr: string): CharSpan[] {
  const o = [...oldStr]
  const n = [...newStr]
  const dp = computeLCS(o, n)
  const spans = backtrack(o, n, dp, (type, oi, ni) => {
    if (type === 'equal') return { type: 'normal' as const, text: o[oi] }
    if (type === 'add') return { type: 'add' as const, text: n[ni] }
    return { type: 'remove' as const, text: o[oi] }
  })
  // 合并连续同类型片段
  const merged: CharSpan[] = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    if (last && last.type === s.type) last.text += s.text
    else merged.push({ ...s })
  }
  return merged
}

export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.replace(/\r\n/g, '\n').split('\n')
  const newLines = newText.replace(/\r\n/g, '\n').split('\n')
  const dp = computeLCS(oldLines, newLines)

  let oldLineNum = oldLines.length
  let newLineNum = newLines.length

  const raw = backtrack(oldLines, newLines, dp, (type, oi, ni) => ({
    type,
    content: type === 'remove' ? oldLines[oi] : newLines[ni],
    oldLine: type === 'add' ? undefined : oldLineNum--,
    newLine: type === 'remove' ? undefined : newLineNum--,
  }))

  // 第二轮：对 remove → add 的连续行对做字级 diff
  const result: DiffLine[] = []
  let i = 0
  while (i < raw.length) {
    const line = raw[i]
    // 遇到 remove 后面紧跟 add → 行替换，做字级高亮
    if (line.type === 'remove' && i + 1 < raw.length && raw[i + 1].type === 'add') {
      const chars = charDiff(line.content, raw[i + 1].content)
      result.push({ ...line, chars })
      result.push({ ...raw[i + 1], chars })
      i += 2
    } else {
      result.push(line)
      i++
    }
  }
  return result
}
