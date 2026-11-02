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

// ── 合并（把 diff 结果 + 勾选状态还原成最终文本）──────────────────────

export interface MergeOptions {
  granularity?: DiffGranularity
  /** 原文行尾风格：crlf 时行级合并用 \r\n，避免应用后整章换行被改写 */
  eol?: 'lf' | 'crlf'
}

/** 判断原文行尾风格（出现任意 \r\n 即视为 CRLF 文档） */
export function detectEol(text: string): 'lf' | 'crlf' {
  return text.includes('\r\n') ? 'crlf' : 'lf'
}

/**
 * 按勾选状态合并出最终文本。
 *
 * ⚠️ 连接符必须跟随粒度：word 模式下每条 DiffLine 是一个**文本片段**而非一行，
 * 用 '\n' 拼接会把正文粉碎成逐片段换行（曾导致应用 AI 修改后正文每字一行）。
 *
 * @param lines      computeDiff 的结果
 * @param isOff      该行/片段是否被用户取消勾选
 */
export function mergeDiffLines(
  lines: DiffLine[],
  isOff: (index: number) => boolean,
  opts: MergeOptions = {},
): string {
  const parts: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.type === 'equal') {
      parts.push(line.content)
    } else if (line.type === 'add') {
      if (!isOff(i)) parts.push(line.content)
    } else {
      // remove：勾选（未取消）= 真的删除；取消勾选 = 保留原行
      if (isOff(i)) parts.push(line.content)
    }
  }
  const sep = opts.granularity === 'word'
    ? ''
    : opts.eol === 'crlf' ? '\r\n' : '\n'
  return parts.join(sep)
}

// ── 修改块分组：勾选的最小单位 ──────────────────────────────────────

export interface DiffHunk {
  /** 首个可切换片段在 lines 中的下标 */
  start: number
  /** 末个可切换片段的下标（含） */
  end: number
  removeIdx: number[]
  addIdx: number[]
}

export interface GroupOptions {
  /**
   * 相邻修改块之间可容忍的未变更字符数，不超过该值时并入同一块。
   *
   * 词粒度下这是核心修正：LCS 会把一次整句润色切成十几个「删几字 / 加几字」，
   * 中间夹着「长」「回鞘」「，」这类短 equal。若不合并，用户要逐片段勾选十几次，
   * 而且取消其中一半会得到**病句**（删了字却没补上）。合并后一处修改 = 一个勾选框。
   */
  mergeGap?: number
}

/**
 * 把 diff 片段归成「修改块」。
 *
 * 相邻的删除 / 新增序列视为同一处修改。这是勾选与拒绝的最小单位——
 * 块内所有片段同进同退，因此「取消一半」这种会写出病句的状态在 UI 上不可能出现。
 */
export function groupHunks(lines: DiffLine[], opts: GroupOptions = {}): DiffHunk[] {
  const mergeGap = opts.mergeGap ?? 0
  const hunks: DiffHunk[] = []
  let cur: DiffHunk | null = null
  let gapChars = 0
  let gapSegs = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.type === 'equal') {
      if (cur) {
        gapChars += line.content.length
        gapSegs++
      }
      continue
    }
    // 无间隔（gapSegs === 0）必然同块；有间隔则需在容忍范围内
    const canMerge = cur !== null && (gapSegs === 0 || (mergeGap > 0 && gapChars <= mergeGap))
    if (canMerge) {
      cur!.end = i
    } else {
      cur = { start: i, end: i, removeIdx: [], addIdx: [] }
      hunks.push(cur)
    }
    if (line.type === 'remove') cur!.removeIdx.push(i)
    else cur!.addIdx.push(i)
    gapChars = 0
    gapSegs = 0
  }
  return hunks
}

// ── 显示行：把片段流整理成可阅读的行 ────────────────────────────────

export interface DiffSeg {
  /** 在 lines 数组中的下标，用于查询勾选状态 */
  index: number
  type: DiffLine['type']
  content: string
}

export interface DiffRow {
  segs: DiffSeg[]
  /** 该行是否含变更片段 */
  changed: boolean
  /** 行级粒度下的原始行号 */
  oldLine?: number
  newLine?: number
}

/**
 * 把片段流整理成「显示行」。
 *
 * - line 粒度：每个片段本身就是一行，直接映射；
 * - word 粒度：片段是**文本片段**而非一行，按其内部的换行切分成多行，
 *   行内保留多个片段。正文这才像散文一样连续可读——此前每片段独占一行，
 *   一句话被拆成十几行，读起来是断的。
 */
export function toRows(lines: DiffLine[], granularity: DiffGranularity = 'word'): DiffRow[] {
  if (granularity === 'line') {
    return lines.map((l, i) => ({
      segs: [{ index: i, type: l.type, content: l.content }],
      changed: l.type !== 'equal',
      oldLine: l.oldLine,
      newLine: l.newLine,
    }))
  }

  const rows: DiffRow[] = []
  let cur: DiffRow = { segs: [], changed: false }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const parts = l.content.split('\n')
    for (let k = 0; k < parts.length; k++) {
      if (k > 0) {
        rows.push(cur)
        cur = { segs: [], changed: false }
      }
      const text = parts[k]
      if (!text) continue
      cur.segs.push({ index: i, type: l.type, content: text })
      if (l.type !== 'equal') cur.changed = true
    }
  }
  // 末行即使为空也要保留，否则文本以换行结尾时会少一行
  if (cur.segs.length > 0 || rows.length === 0) rows.push(cur)
  return rows
}

export type DiffDisplayItem =
  | { kind: 'row'; rowIndex: number }
  | { kind: 'fold'; from: number; count: number }

/**
 * 折叠长段未改动内容：变更行前后各保留 contextLines 行，中间收成一条「展开 N 行」。
 *
 * 与 Git 展示 hunk 的方式一致。整章对比时用户要看的是改动，
 * 若把全文逐行铺开，几十处改动里找一处比直接读原文还慢。
 */
export function buildDisplayItems(rows: DiffRow[], contextLines = 2): DiffDisplayItem[] {
  const ctx = Math.max(0, Math.floor(contextLines))
  const items: DiffDisplayItem[] = []
  let i = 0
  while (i < rows.length) {
    if (rows[i].changed) {
      items.push({ kind: 'row', rowIndex: i })
      i++
      continue
    }
    let j = i
    while (j < rows.length && !rows[j].changed) j++
    const len = j - i
    if (len <= ctx * 2 + 1) {
      // 短段直接展开：折叠行本身也占一行，不如全显示
      for (let k = i; k < j; k++) items.push({ kind: 'row', rowIndex: k })
    } else if (i === 0) {
      // 文首被裁掉的部分也要给折叠项，否则用户会以为文件从这里开始
      const drop = len - Math.min(ctx, len)
      if (drop > 0) items.push({ kind: 'fold', from: i, count: drop })
      for (let k = j - ctx; k < j; k++) items.push({ kind: 'row', rowIndex: k })
    } else if (j === rows.length) {
      for (let k = i; k < i + ctx; k++) items.push({ kind: 'row', rowIndex: k })
      const drop = len - ctx
      if (drop > 0) items.push({ kind: 'fold', from: i + ctx, count: drop })
    } else {
      for (let k = i; k < i + ctx; k++) items.push({ kind: 'row', rowIndex: k })
      items.push({ kind: 'fold', from: i + ctx, count: len - ctx * 2 })
      for (let k = j - ctx; k < j; k++) items.push({ kind: 'row', rowIndex: k })
    }
    i = j
  }
  return items
}
