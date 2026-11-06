import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEditorStats } from '../useEditorStats'

/**
 * useEditorStats 单元测试：字数统计防抖（300ms）+ 清理定时器。
 */

describe('useEditorStats', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('防抖 300ms 后统计当前文档字数', () => {
    let doc = '你好世界'
    const { chapterWords, updateChapterWords } = useEditorStats({
      getView: () => ({ state: { doc: { toString: () => doc } } }) as never,
    })
    updateChapterWords()
    doc = '你好世界，再见'
    updateChapterWords() // 连续调用，只保留最后一次
    expect(chapterWords.value).toBe(0) // 未到 300ms

    vi.advanceTimersByTime(300)
    // countWords('你好世界，再见') 按中文逐字=7
    expect(chapterWords.value).toBe(7)
  })

  it('clearWordsTimer 取消挂起的统计', () => {
    const { chapterWords, updateChapterWords, clearWordsTimer } = useEditorStats({
      getView: () => ({ state: { doc: { toString: () => 'abc' } } }) as never,
    })
    updateChapterWords()
    clearWordsTimer()
    vi.advanceTimersByTime(300)
    expect(chapterWords.value).toBe(0)
  })

  it('view 为空时不清空已有统计', () => {
    const { chapterWords, updateChapterWords } = useEditorStats({
      getView: () => null,
    })
    chapterWords.value = 42
    updateChapterWords()
    vi.advanceTimersByTime(300)
    expect(chapterWords.value).toBe(42)
  })
})
