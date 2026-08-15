import { describe, it, expect } from 'vitest'
import { computeDiff, type DiffLine } from './useDiff'

function types(diff: DiffLine[]): string {
  return diff.map((l) => (l.type === 'equal' ? 'e' : l.type === 'add' ? 'a' : 'r')).join('')
}

describe('computeDiff（行级 diff）', () => {
  it('完全相同 → 全 equal', () => {
    const d = computeDiff('a\nb\nc', 'a\nb\nc')
    expect(types(d)).toBe('eee')
    expect(d[0]).toMatchObject({ type: 'equal', content: 'a', oldLine: 1, newLine: 1 })
  })

  it('纯追加（续写场景）→ 前缀掐掉后只剩 add', () => {
    const d = computeDiff('第一章\n正文', '第一章\n正文\n新增段落')
    expect(types(d)).toBe('eea')
    expect(d[2]).toMatchObject({ type: 'add', content: '新增段落', newLine: 3 })
  })

  it('中间修改 → remove + add', () => {
    const d = computeDiff('a\nold\nc', 'a\nnew\nc')
    expect(types(d)).toBe('erae')
  })

  it('行号 1 起始且连续', () => {
    const d = computeDiff('a\nb', 'a\nb\nc')
    expect(d.map((l) => l.oldLine ?? null)).toEqual([1, 2, null])
    expect(d.map((l) => l.newLine ?? null)).toEqual([1, 2, 3])
  })

  it('CRLF 归一化', () => {
    const d = computeDiff('a\r\nb', 'a\nb')
    expect(types(d)).toBe('ee')
  })

  it('空文档 → 全 add', () => {
    const d = computeDiff('', 'x\ny')
    expect(types(d)).toBe('aa')
  })

  it('无公共前后缀的整块替换 → 全删 + 全增', () => {
    const oldText = Array.from({ length: 40 }, (_, i) => 'old-line-' + i).join('\n')
    const newText = Array.from({ length: 40 }, (_, i) => 'new-line-' + i).join('\n')
    const d = computeDiff(oldText, newText)
    expect(d.filter((l) => l.type === 'remove').length).toBe(40)
    expect(d.filter((l) => l.type === 'add').length).toBe(40)
  })

  it('公共前缀/后缀掐掉后仍保持行号正确', () => {
    const d = computeDiff('h\na\nx\nf', 'h\nb\nx\nf')
    // h 前缀、x 与 f 两行后缀 → 中间 a→b（e + r + a + e + e）
    expect(types(d)).toBe('eraee')
    expect(d[1]).toMatchObject({ type: 'remove', content: 'a', oldLine: 2 })
    expect(d[2]).toMatchObject({ type: 'add', content: 'b', newLine: 2 })
  })
})
