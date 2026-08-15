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

export function computeDiff(oldText: string, newText: string): DiffLine[] {
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
