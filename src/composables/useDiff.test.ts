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

describe('computeDiff（词级 diff，散文场景）', () => {
  it('只改一个字 → 其余全 equal，修改为字符级片段', () => {
    const d = computeDiff('陈屿站在天台边缘', '陈屿站在天台边缘上', 'word')
    expect(d[0]).toMatchObject({ type: 'equal', content: '陈屿站在天台边缘' })
    expect(d[d.length - 1]).toMatchObject({ type: 'add', content: '上' })
  })

  it('整句替换 → 保留公共字，中间 remove + add', () => {
    const d = computeDiff('他转身离开。', '他头也不回地走了。', 'word')
    expect(d.map((l) => l.type)).toEqual(['equal', 'remove', 'add', 'equal'])
    expect(d[1].content).toBe('转身离开')
    expect(d[2].content).toBe('头也不回地走了')
  })

  it('英文按单词切分，空格与相同词保持 equal', () => {
    const d = computeDiff('hello world', 'hello there', 'word')
    expect(d[0]).toMatchObject({ type: 'equal', content: 'hello ' })
    expect(d[1]).toMatchObject({ type: 'remove', content: 'world' })
    expect(d[2]).toMatchObject({ type: 'add', content: 'there' })
  })

  it('相同文本 → 全 equal', () => {
    const d = computeDiff('雨夜。', '雨夜。', 'word')
    expect(d.length).toBe(1)
    expect(d[0].type).toBe('equal')
  })

  it('空文本 → 全 add', () => {
    const d = computeDiff('', '新的句子。', 'word')
    expect(d[0].type).toBe('add')
  })

  it('word 模式不产生行号', () => {
    const d = computeDiff('a。', 'b。', 'word')
    expect(d.every((l) => l.oldLine === undefined && l.newLine === undefined)).toBe(true)
  })
})
