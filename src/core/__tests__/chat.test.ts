import { describe, it, expect } from 'vitest'
import { trimHistory } from '../chat'

function turns(n: number, content = 'x'): { role: string; content: string }[] {
  return Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content }))
}

describe('trimHistory', () => {
  it('空历史返回空', () => {
    expect(trimHistory([])).toEqual([])
  })

  it('短历史原样返回', () => {
    const h = turns(3, '你好')
    expect(trimHistory(h)).toEqual(h)
  })

  it('按条数上限保留最近的', () => {
    const h = turns(20, 'a')
    const out = trimHistory(h, { maxTurns: 5, maxChars: 99999 })
    expect(out).toHaveLength(5)
    expect(out).toEqual(h.slice(-5))
  })

  it('按字符预算从最旧处丢弃', () => {
    const h = [
      { role: 'user', content: 'a'.repeat(100) },
      { role: 'assistant', content: 'b'.repeat(100) },
      { role: 'user', content: 'c'.repeat(100) },
    ]
    const out = trimHistory(h, { maxTurns: 99, maxChars: 250 })
    expect(out).toHaveLength(2)
    expect(out[0].content.startsWith('b')).toBe(true)
    expect(out[1].content.startsWith('c')).toBe(true)
  })

  it('最后一条即使超预算也保留（否则等于丢了当前提问）', () => {
    const h = [
      { role: 'user', content: 'old' },
      { role: 'user', content: 'x'.repeat(500) },
    ]
    const out = trimHistory(h, { maxTurns: 99, maxChars: 100 })
    expect(out).toHaveLength(1)
    expect(out[0].content).toHaveLength(500)
  })

  it('条数上限与字符预算同时生效', () => {
    const h = turns(30, 'y'.repeat(50))
    const out = trimHistory(h, { maxTurns: 10, maxChars: 120 })
    expect(out).toHaveLength(2)
  })

  it('不改动入参数组', () => {
    const h = turns(20, 'a')
    const copy = [...h]
    trimHistory(h, { maxTurns: 3 })
    expect(h).toEqual(copy)
  })
})
