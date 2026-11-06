import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scanHeadings, useEditorOutline, type HeadingDoc } from '../useEditorOutline'

/**
 * useEditorOutline 单元测试：重点是纯函数 scanHeadings 的标题解析。
 */

/** 构造一个最小的 HeadingDoc：给定多行文本（带绝对位置） */
function makeDoc(lines: string[]): HeadingDoc {
  let from = 0
  const lineObjs = lines.map((text) => {
    const obj = { text, from }
    from += text.length + 1 // 假设每行末尾一个 \n
    return obj
  })
  return {
    lines: lines.length,
    line(i: number) {
      return lineObjs[i - 1]
    },
  }
}

describe('scanHeadings', () => {
  it('解析 1-3 级标题，清理文本与位置', () => {
    const doc = makeDoc([
      '# 卷名',
      '正文第一行',
      '## 第一章',
      '### 1.1 小节',
      '#### 四级不算',
      '#无空格的井号不算',
    ])
    const result = scanHeadings(doc)
    expect(result.map((h) => h.text)).toEqual(['卷名', '第一章', '1.1 小节'])
    expect(result.map((h) => h.level)).toEqual([1, 2, 3])
    expect(result[0].pos).toBe(0) // 第一行 from=0
  })

  it('四级标题（####）与无空格的 # 不算标题', () => {
    const doc = makeDoc(['#### 四级', '###x 无空格', '# 一级'])
    const result = scanHeadings(doc)
    expect(result.map((h) => h.text)).toEqual(['一级'])
  })

  it('null doc 返回空数组', () => {
    expect(scanHeadings(null)).toEqual([])
  })
})

describe('useEditorOutline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('toggleOutline 打开时扫描并显示', () => {
    const doc = makeDoc(['# 卷名'])
    const { showOutline, headings, toggleOutline } = useEditorOutline({
      getDoc: () => doc,
      jumpTo: () => {},
    })
    toggleOutline()
    expect(showOutline.value).toBe(true)
    expect(headings.value.map((h) => h.text)).toEqual(['卷名'])
  })

  it('scheduleOutlineRefresh 只在打开时防抖重建', () => {
    let doc = makeDoc(['# 卷名'])
    const { showOutline, headings, scheduleOutlineRefresh, toggleOutline } = useEditorOutline({
      getDoc: () => doc,
      jumpTo: () => {},
    })
    toggleOutline() // 打开 → 扫描「卷名」
    doc = makeDoc(['# 卷名', '## 新增章节'])
    scheduleOutlineRefresh()
    expect(headings.value.map((h) => h.text)).toEqual(['卷名']) // 未到 400ms
    vi.advanceTimersByTime(400)
    expect(headings.value.map((h) => h.text)).toEqual(['卷名', '新增章节'])
  })

  it('jumpToHeading 调用注入的 jumpTo 并关闭大纲', () => {
    const jumpTo = vi.fn()
    const { showOutline, jumpToHeading } = useEditorOutline({
      getDoc: () => makeDoc(['# x']),
      jumpTo,
    })
    showOutline.value = true
    jumpToHeading(5)
    expect(jumpTo).toHaveBeenCalledWith(5)
    expect(showOutline.value).toBe(false)
  })
})
