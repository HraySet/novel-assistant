import { describe, it, expect } from 'vitest'
import { countWords } from './countWords'

describe('countWords（中英文混排字数，与 Rust 端 count_words 对齐）', () => {
  it('纯中文：每个 CJK 字符计 1 字', () => {
    expect(countWords('你好世界')).toBe(4)
  })

  it('纯英文：连续字母/数字按词计 1 字', () => {
    expect(countWords('hello world')).toBe(2)
    // 数字按连续块计词："version"=1、"2"=1、"0"=1（点号隔断）、"released"=1
    expect(countWords('version 2.0 released')).toBe(4)
  })

  it('中英混排：中文逐字 + 英文按词', () => {
    // 他(1)说(1) + hello(1) world(1) + 再(1)见(1) = 6
    expect(countWords('他说 hello world 再见')).toBe(6)
  })

  it('空串为 0；CJK 标点与全角字符按实现计 1 字（两端一致）', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('，。！？')).toBe(4)
    expect(countWords('ＡＢ')).toBe(2)
  })

  it('与 Rust 端行为一致：CJK 字符后接英文会隔断英文词', () => {
    // 中(1) hello(1) → 2
    expect(countWords('中hello')).toBe(2)
  })
})
