import { describe, it, expect } from 'vitest'
import {
  computeDiff,
  groupHunks,
  toRows,
  buildDisplayItems,
  mergeDiffLines,
  type DiffLine,
} from './useDiff'

/** 便利构造：e=equal r=remove a=add */
function L(spec: string): DiffLine[] {
  return spec.split('|').map((raw) => {
    const type = raw[0] === 'e' ? 'equal' : raw[0] === 'r' ? 'remove' : 'add'
    return { type, content: raw.slice(1) } as DiffLine
  })
}

describe('groupHunks：把片段归成修改块', () => {
  it('相邻的删除与新增合并为一块', () => {
    const hunks = groupHunks(L('e甲|r乙|a丙|e。'), { mergeGap: 0 })
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({ start: 1, end: 2, removeIdx: [1], addIdx: [2] })
  })

  it('被长段未改动内容隔开的修改是两块', () => {
    const hunks = groupHunks(L('r甲|a乙|e这是一段足够长的未改动内容|r丙|a丁'), { mergeGap: 6 })
    expect(hunks).toHaveLength(2)
    expect(hunks[0].removeIdx).toEqual([0])
    expect(hunks[1].removeIdx).toEqual([3])
  })

  it('mergeGap 内夹着的短 equal 不切断修改块', () => {
    // 「长」只有 1 字，应并入同一处修改
    const hunks = groupHunks(L('r把|a缓缓将|e长|r剑插|a刀收|e回鞘'), { mergeGap: 6 })
    expect(hunks).toHaveLength(1)
    expect(hunks[0].removeIdx).toEqual([0, 3])
    expect(hunks[0].addIdx).toEqual([1, 4])
  })

  it('超过 mergeGap 的 equal 会切断', () => {
    const hunks = groupHunks(L('r甲|a乙|e七个字的分隔内容|r丙'), { mergeGap: 6 })
    expect(hunks).toHaveLength(2)
  })

  it('mergeGap 为 0 时任何 equal 都切断（行粒度的默认行为）', () => {
    const hunks = groupHunks(L('r旧行|a新行|e未改动|r旧行2|a新行2'))
    expect(hunks).toHaveLength(2)
  })

  it('纯新增 / 纯删除也各自成块', () => {
    expect(groupHunks(L('e前|a新一|a新二|e后'))).toHaveLength(1)
    expect(groupHunks(L('e前|r旧一|r旧二|e后'))).toHaveLength(1)
  })

  it('无变更时返回空数组', () => {
    expect(groupHunks(L('e甲|e乙'))).toEqual([])
  })

  it('整句润色被打包成一整块（而不是十几个碎片）', () => {
    const oldText = '他把长剑插回鞘中，转身望向远处的山影。'
    const newText = '他缓缓将长刀收回鞘内，回头看向远方的群山。'
    const diff = computeDiff(oldText, newText, 'word')
    // 未归组时片段极多——这正是用户要勾十几次的根源
    const rawMutable = diff.filter((l) => l.type !== 'equal').length
    expect(rawMutable).toBeGreaterThan(6)
    const hunks = groupHunks(diff, { mergeGap: 6 })
    expect(hunks).toHaveLength(1)
  })

  it('两处相隔很远的修改仍可分别勾选', () => {
    const oldText = '第一段的开头部分需要改写，中间这一大段话保持完全不变不做任何调整，第二段的结尾也要改动。'
    const newText = '第一段的起始部分需要重写，中间这一大段话保持完全不变不做任何调整，第二段的收尾也要修改。'
    const diff = computeDiff(oldText, newText, 'word')
    const hunks = groupHunks(diff, { mergeGap: 6 })
    expect(hunks.length).toBe(2)
  })
})

describe('整块勾选 → 合并结果', () => {
  it('取消整块 = 完全回到原文（不会留下残缺句）', () => {
    const oldText = '他把长剑插回鞘中，转身望向远处的山影。'
    const newText = '他缓缓将长刀收回鞘内，回头看向远方的群山。'
    const diff = computeDiff(oldText, newText, 'word')
    const hunks = groupHunks(diff, { mergeGap: 6 })
    // 把整块都关掉
    const off = new Set<number>()
    for (const h of hunks) for (const i of [...h.removeIdx, ...h.addIdx]) off.add(i)
    const merged = mergeDiffLines(diff, (i) => off.has(i), { granularity: 'word' })
    expect(merged).toBe(oldText)
  })

  it('保留整块 = 完全等于新文', () => {
    const oldText = '他把长剑插回鞘中，转身望向远处的山影。'
    const newText = '他缓缓将长刀收回鞘内，回头看向远方的群山。'
    const diff = computeDiff(oldText, newText, 'word')
    const merged = mergeDiffLines(diff, () => false, { granularity: 'word' })
    expect(merged).toBe(newText)
  })

  it('两处修改只关一处，结果介于原文与新文之间且语句完整', () => {
    const oldText = '甲句要改，中间隔开一段很长的内容不动，乙句也要改。'
    const newText = '甲句已改，中间隔开一段很长的内容不动，乙句也改了。'
    const diff = computeDiff(oldText, newText, 'word')
    const hunks = groupHunks(diff, { mergeGap: 6 })
    expect(hunks.length).toBeGreaterThanOrEqual(2)
    // 只关掉第一块
    const off = new Set<number>([...hunks[0].removeIdx, ...hunks[0].addIdx])
    const merged = mergeDiffLines(diff, (i) => off.has(i), { granularity: 'word' })
    expect(merged).toBe('甲句要改，中间隔开一段很长的内容不动，乙句也改了。')
  })
})

describe('toRows：散文按行内片段渲染', () => {
  it('词粒度把同一句的多个片段放在一行', () => {
    const rows = toRows(L('e甲。|r乙|a丙|e。'), 'word')
    expect(rows).toHaveLength(1)
    expect(rows[0].segs.map((s) => s.content)).toEqual(['甲。', '乙', '丙', '。'])
    expect(rows[0].changed).toBe(true)
  })

  it('片段里的换行会切断显示行', () => {
    const rows = toRows(L('e第一句。\n第二句。'), 'word')
    expect(rows).toHaveLength(2)
    expect(rows[0].segs[0].content).toBe('第一句。')
    expect(rows[1].segs[0].content).toBe('第二句。')
  })

  it('空白行保留为独立显示行（段落间距不能丢）', () => {
    const rows = toRows(L('e甲\n\n乙'), 'word')
    expect(rows).toHaveLength(3)
    expect(rows[1].segs).toEqual([])
  })

  it('行粒度一一映射并保留行号', () => {
    const rows = toRows([
      { type: 'equal', content: 'a', oldLine: 1, newLine: 1 },
      { type: 'add', content: 'b', newLine: 2 },
    ], 'line')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ changed: true, newLine: 2 })
    expect(rows[1].segs[0].type).toBe('add')
  })

  it('空输入不产生崩溃', () => {
    expect(toRows([], 'word')).toHaveLength(1)
    expect(toRows([], 'line')).toEqual([])
  })
})

describe('buildDisplayItems：折叠未改动区域', () => {
  const rows = (spec: string) => toRows(L(spec), 'line')

  it('全部是变更行时逐行显示', () => {
    const items = buildDisplayItems(rows('r甲|a乙|r丙'), 2)
    expect(items.every((i) => i.kind === 'row')).toBe(true)
    expect(items).toHaveLength(3)
  })

  it('中间长段未改动收成一条折叠项', () => {
    // 10 行 equal，前后各 2 行上下文 → 折叠中间 6 行
    const spec = 'e1|e2|r旧|a新|e3|e4|e5|e6|e7|e8|e9|e10'
    const items = buildDisplayItems(rows(spec), 2)
    const folds = items.filter((i) => i.kind === 'fold')
    expect(folds).toHaveLength(1)
    expect(folds[0]).toMatchObject({ kind: 'fold', count: 6 })
  })

  it('开头与结尾的未改动区只保留相邻上下文，裁掉的部分给出折叠提示', () => {
    const spec = 'e1|e2|e3|e4|e5|e6|r旧|a新|ee1|ee2|ee3|ee4|ee5|ee6'
    const items = buildDisplayItems(rows(spec), 2)
    // 头部 6 行 → 只留 2 行，裁 4 行；尾部 6 行 → 只留 2 行，裁 4 行
    const rowCount = items.filter((i) => i.kind === 'row').length
    expect(rowCount).toBe(2 + 2 + 2)
    const folds = items.filter((i) => i.kind === 'fold')
    expect(folds).toHaveLength(2)
    expect(folds.map((f) => f.count)).toEqual([4, 4])
  })

  it('短段不折叠（折叠行本身也占一行，不划算）', () => {
    const items = buildDisplayItems(rows('r旧|a新|e1|e2|e3|e4|e5|r旧2'), 2)
    expect(items.filter((i) => i.kind === 'fold')).toHaveLength(0)
  })

  it('contextLines 为 0 时完全收起未改动行', () => {
    const items = buildDisplayItems(rows('e1|e2|r旧|a新|e3|e4'), 0)
    const kinds = items.map((i) => i.kind)
    expect(kinds).toEqual(['fold', 'row', 'row', 'fold'])
  })
})
