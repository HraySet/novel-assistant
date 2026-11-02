import { describe, it, expect } from 'vitest'
import { computeDiff, mergeDiffLines, detectEol } from './useDiff'

/**
 * 合并回写的回归测试。
 *
 * 此前 computeMerged 内嵌在 DiffView.vue 里且用 lines.join('\n')：
 * word 模式下每条 DiffLine 是文本片段而非行，结果是正文被逐片段折断。
 * 这组用例是「应用 AI 修改」这条链路的唯一自动化护栏。
 */

const OLD = '他把长剑插回鞘中，转身望向远处的山影。'
const NEW = '他缓缓将长刀收回鞘内，回头看向远方的群山。'

const allOn = () => false
const allOff = () => true

describe('mergeDiffLines（word 粒度，散文场景）', () => {
  it('全部勾选 → 结果严格等于 AI 文本', () => {
    const d = computeDiff(OLD, NEW, 'word')
    expect(mergeDiffLines(d, allOn, { granularity: 'word' })).toBe(NEW)
  })

  it('不得插入任何换行（回归：旧实现逐片段 join(\'\\n\')）', () => {
    const d = computeDiff(OLD, NEW, 'word')
    const merged = mergeDiffLines(d, allOn, { granularity: 'word' })
    expect(merged).not.toContain('\n')
  })

  it('全部取消勾选 → 结果等于原文', () => {
    const d = computeDiff(OLD, NEW, 'word')
    expect(mergeDiffLines(d, allOff, { granularity: 'word' })).toBe(OLD)
  })

  it('取消一对「删除+新增」修改块 → 原文完整保留', () => {
    const d = computeDiff('甲。乙。', '甲。丙。', 'word')
    // 相邻的 remove + add 属于同一处修改，UI 语义上应视为一个整体
    const rmIdx = d.findIndex((l) => l.type === 'remove')
    const addIdx = d.findIndex((l) => l.type === 'add')
    expect(rmIdx).toBeGreaterThan(-1)
    expect(addIdx).toBeGreaterThan(rmIdx)
    const merged = mergeDiffLines(d, (i) => i === rmIdx || i === addIdx, { granularity: 'word' })
    expect(merged).toBe('甲。乙。')
  })

  /**
   * 已知局限（等待 hunk 分组解决）：
   * 目前勾选单位是「片段」而非「修改块」，只取消替换对的其中一半会得到残缺句子
   * （删了旧字却没补新字 → '甲。。'）。这不是合并逻辑的错，是交互粒度的问题。
   * 本用例把现状钉住，将来改成按 hunk 勾选后此处应一并更新。
   */
  it('仅取消 replace 的新增半边 → 现状为残缺文本（待 hunk 分组修复）', () => {
    const d = computeDiff('甲。乙。', '甲。丙。', 'word')
    const addIdx = d.findIndex((l) => l.type === 'add')
    expect(mergeDiffLines(d, (i) => i === addIdx, { granularity: 'word' })).toBe('甲。。')
  })

  it('仅取消 replace 的删除半边 → 新旧并存', () => {
    const d = computeDiff('甲。乙。', '甲。丙。', 'word')
    const rmIdx = d.findIndex((l) => l.type === 'remove')
    expect(mergeDiffLines(d, (i) => i === rmIdx, { granularity: 'word' })).toBe('甲。乙丙。')
  })

  it('多段落文本：段落内部的换行属于内容，不应被连接符干扰', () => {
    const oldText = '第一段内容。\n\n第二段内容。'
    const newText = '第一段内容。\n\n第二段改过了。'
    const d = computeDiff(oldText, newText, 'word')
    expect(mergeDiffLines(d, allOn, { granularity: 'word' })).toBe(newText)
  })
})

describe('mergeDiffLines（line 粒度）', () => {
  it('全部勾选 → 结果等于新文本', () => {
    const oldText = 'a\nb\nc'
    const newText = 'a\nB\nc'
    const d = computeDiff(oldText, newText, 'line')
    expect(mergeDiffLines(d, allOn, { granularity: 'line' })).toBe(newText)
  })

  it('全部取消 → 结果等于原文', () => {
    const d = computeDiff('a\nb\nc', 'a\nB\nc', 'line')
    expect(mergeDiffLines(d, allOff, { granularity: 'line' })).toBe('a\nb\nc')
  })

  it('CRLF 文档保持 CRLF（回归：应用后整章换行被改写）', () => {
    const oldText = 'a\r\nb\r\nc'
    const newText = 'a\r\nX\r\nc'
    const eol = detectEol(oldText)
    expect(eol).toBe('crlf')
    const d = computeDiff(oldText, newText, 'line')
    const merged = mergeDiffLines(d, allOn, { granularity: 'line', eol })
    expect(merged).toBe('a\r\nX\r\nc')
    expect(merged).not.toMatch(/[^\r]\n/)
  })

  it('LF 文档不被升级成 CRLF', () => {
    const d = computeDiff('a\nb', 'a\nX', 'line')
    expect(mergeDiffLines(d, allOn, { granularity: 'line', eol: detectEol('a\nb') })).toBe('a\nX')
  })
})

describe('detectEol', () => {
  it('含 \\r\\n 判定为 crlf', () => expect(detectEol('a\r\nb')).toBe('crlf'))
  it('纯 \\n 判定为 lf', () => expect(detectEol('a\nb')).toBe('lf'))
  it('空文本判定为 lf', () => expect(detectEol('')).toBe('lf'))
})
