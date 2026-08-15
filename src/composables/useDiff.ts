/**
 * 行级 Diff：只做增删行检测，不做字级高亮。
 *
 * 算法：
 * 1. 先掐掉公共前缀/后缀（小说场景里 AI 常只改中间或追加结尾，
 *    续写/局部润色因此几乎零成本）；
 * 2. 中间块用 O(m×n) 的 LCS DP，Uint32Array 存表（比 number[][] 省一半以上内存）；
 * 3. 中间块超过 MAX_DP_CELLS 时降级为「全部删除 + 全部新增」，
 *    保证结果正确且大文档永不卡死。
 */

export interface DiffLine {
  type: 'add' | 'remove' | 'equal'
  content: string
  oldLine?: number
  newLine?: number
}

/** 中间块 DP 表单元格上限：超出后降级（4M 单元 ≈ 16MB） */
const MAX_DP_CELLS = 4_000_000

export type DiffGranularity = 'line' | 'word'

export function computeDiff(oldText: string, newText: string, granularity: DiffGranularity = 'line'): DiffLine[] {
  if (granularity === 'word') return computeWordDiff(oldText, newText)
  // 空文本视为 0 行（''.split('\n') 会得到一条空行，显示上多余）
  const oldLines = oldText ? oldText.replace(/\r\n/g, '\n').split('\n') : []
  const newLines = newText ? newText.replace(/\r\n/g, '\n').split('\n') : []
  const m = oldLines.length
  const n = newLines.length

  // ── 1) 公共前缀 / 后缀 ──
  let prefix = 0
  while (prefix < m && prefix < n && oldLines[prefix] === newLines[prefix]) prefix++
  let suffix = 0
  while (
    suffix < m - prefix &&
    suffix < n - prefix &&
    oldLines[m - 1 - suffix] === newLines[n - 1 - suffix]
  ) suffix++

  const midOld = oldLines.slice(prefix, m - suffix)
  const midNew = newLines.slice(prefix, n - suffix)
  const mm = midOld.length
  const nn = midNew.length

  const out: DiffLine[] = []
  for (let i = 0; i < prefix; i++) {
    out.push({ type: 'equal', content: oldLines[i], oldLine: i + 1, newLine: i + 1 })
  }

  // ── 2) 中间块 diff ──
  if (mm === 0 || nn === 0) {
    for (let i = 0; i < mm; i++) {
      out.push({ type: 'remove', content: midOld[i], oldLine: prefix + i + 1 })
    }
    for (let j = 0; j < nn; j++) {
      out.push({ type: 'add', content: midNew[j], newLine: prefix + j + 1 })
    }
  } else if (mm * nn > MAX_DP_CELLS) {
    // 降级：全删 + 全增（结果正确，只是不够紧凑）
    for (let i = 0; i < mm; i++) {
      out.push({ type: 'remove', content: midOld[i], oldLine: prefix + i + 1 })
    }
    for (let j = 0; j < nn; j++) {
      out.push({ type: 'add', content: midNew[j], newLine: prefix + j + 1 })
    }
  } else {
    // LCS DP（一维滚动行，行主序，原地写同一张表即可回溯）
    const W = nn + 1
    const table = new Uint32Array((mm + 1) * W)
    for (let i = 1; i <= mm; i++) {
      for (let j = 1; j <= nn; j++) {
        table[i * W + j] = midOld[i - 1] === midNew[j - 1]
          ? table[(i - 1) * W + (j - 1)] + 1
          : Math.max(table[i * W + (j - 1)], table[(i - 1) * W + j])
      }
    }

    // 回溯（1 起始行号）
    const seg: DiffLine[] = []
    let i = mm
    let j = nn
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
        seg.push({ type: 'equal', content: midOld[i - 1], oldLine: prefix + i, newLine: prefix + j })
        i--
        j--
      } else if (j > 0 && (i === 0 || table[i * W + (j - 1)] >= table[(i - 1) * W + j])) {
        seg.push({ type: 'add', content: midNew[j - 1], newLine: prefix + j })
        j--
      } else {
        seg.push({ type: 'remove', content: midOld[i - 1], oldLine: prefix + i })
        i--
      }
    }
    seg.reverse()
    out.push(...seg)
  }

  // ── 3) 公共后缀 ──
  for (let k = 0; k < suffix; k++) {
    const oi = m - suffix + k
    const ni = n - suffix + k
    out.push({ type: 'equal', content: oldLines[oi], oldLine: oi + 1, newLine: ni + 1 })
  }

  return out
}

/**
 * 词级/字级 Diff（散文场景）：
 * - 拉丁/数字连续串作为一个词；每个 CJK 字符单独成 token（中文词多为 1-2 字，
 *   字级即近似词级）；标点与空白各自成 token；
 * - LCS 对齐后把相邻同类型的 token 合并成可读片段（不产生行号）。
 */
function computeWordDiff(oldText: string, newText: string): DiffLine[] {
  const oldTokens = tokenize(oldText)
  const newTokens = tokenize(newText)
  const m = oldTokens.length
  const n = newTokens.length
  const out: DiffLine[] = []

  if (m === 0 || n === 0 || m * n > MAX_DP_CELLS) {
    for (const t of oldTokens) out.push({ type: 'remove', content: t })
    for (const t of newTokens) out.push({ type: 'add', content: t })
    return mergeRuns(out)
  }

  const W = n + 1
  const table = new Uint32Array((m + 1) * W)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      table[i * W + j] = oldTokens[i - 1] === newTokens[j - 1]
        ? table[(i - 1) * W + (j - 1)] + 1
        : Math.max(table[i * W + (j - 1)], table[(i - 1) * W + j])
    }
  }

  const seg: DiffLine[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      seg.push({ type: 'equal', content: oldTokens[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || table[i * W + (j - 1)] >= table[(i - 1) * W + j])) {
      seg.push({ type: 'add', content: newTokens[j - 1] })
      j--
    } else {
      seg.push({ type: 'remove', content: oldTokens[i - 1] })
      i--
    }
  }
  seg.reverse()
  return mergeRuns(seg)
}

function isCjkChar(code: number): boolean {
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) || (code >= 0xf900 && code <= 0xfaff)
}

function tokenize(text: string): string[] {
  const tokens: string[] = []
  let buf = ''
  const flush = () => {
    if (buf) {
      tokens.push(buf)
      buf = ''
    }
  }
  for (const ch of text) {
    if (/[A-Za-z0-9]/.test(ch)) {
      buf += ch
      continue
    }
    if (isCjkChar(ch.codePointAt(0) ?? 0)) {
      flush()
      tokens.push(ch)
      continue
    }
    flush()
    tokens.push(ch)
  }
  flush()
  return tokens
}

/** 相邻同类型的 token 合并成片段，提升散文可读性 */
function mergeRuns(lines: DiffLine[]): DiffLine[] {
  const out: DiffLine[] = []
  for (const l of lines) {
    const last = out[out.length - 1]
    if (last && last.type === l.type) last.content += l.content
    else out.push({ ...l })
  }
  return out
}
