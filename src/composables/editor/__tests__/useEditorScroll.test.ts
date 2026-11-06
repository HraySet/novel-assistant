// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEditorScroll } from '../useEditorScroll'

/**
 * useEditorScroll 单元测试。
 * 锁定两个契约：
 * 1. 滚动百分比存取走 localStorage（安全层 readJson/writeJson），防抖 600ms；
 * 2. restore 只在 pct > 0 时滚动（避免新文件闪烁）。
 */

function makeView(scrollTop: number, scrollHeight: number, clientHeight: number) {
  return {
    scrollDOM: { scrollTop, scrollHeight, clientHeight },
  } as unknown as { scrollDOM: HTMLElement }
}

describe('useEditorScroll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
  })

  it('readScrollPercent 计算百分比并写回 ref', () => {
    const view = makeView(300, 1300, 300) // (1300-300)=1000, 300/1000=30%
    const { scrollPercent, readScrollPercent } = useEditorScroll({
      getRoot: () => '/p',
      getView: () => view,
    })
    expect(readScrollPercent()).toBe(30)
    expect(scrollPercent.value).toBe(30)
  })

  it('可滚动距离为 0 时百分比为 0，不除零', () => {
    const view = makeView(0, 300, 300)
    const { readScrollPercent } = useEditorScroll({
      getRoot: () => '/p',
      getView: () => view,
    })
    expect(readScrollPercent()).toBe(0)
  })

  it('scheduleScrollSave 防抖后写入 localStorage（按 path 分 key）', () => {
    const { scheduleScrollSave } = useEditorScroll({
      getRoot: () => '/p',
      getView: () => null,
    })
    scheduleScrollSave('/p/第1章.md', 42)
    // 未到 600ms 不写
    expect(localStorage.getItem('editor-scroll:/p')).toBeNull()
    vi.advanceTimersByTime(600)
    const map = JSON.parse(localStorage.getItem('editor-scroll:/p') || '{}')
    expect(map['/p/第1章.md']).toBe(42)
  })

  it('百分比越界被钳制到 [0, 100]', () => {
    const { scheduleScrollSave } = useEditorScroll({
      getRoot: () => '/p',
      getView: () => null,
    })
    scheduleScrollSave('/p/a.md', 150)
    vi.advanceTimersByTime(600)
    const map = JSON.parse(localStorage.getItem('editor-scroll:/p') || '{}')
    expect(map['/p/a.md']).toBe(100)
  })

  it('restoreScrollPercent 在 pct > 0 时恢复滚动位置', () => {
    const view = makeView(0, 1300, 300)
    localStorage.setItem('editor-scroll:/p', JSON.stringify({ '/p/a.md': 50 }))
    const { restoreScrollPercent } = useEditorScroll({
      getRoot: () => '/p',
      getView: () => view,
    })
    restoreScrollPercent('/p/a.md')
    // (1300-300)*0.5 = 500
    expect((view.scrollDOM as unknown as { scrollTop: number }).scrollTop).toBe(500)
  })

  it('restoreScrollPercent 在 pct=0 时不滚动（避免新文件闪烁）', () => {
    const view = makeView(0, 1300, 300)
    localStorage.setItem('editor-scroll:/p', JSON.stringify({ '/p/a.md': 0 }))
    const { restoreScrollPercent } = useEditorScroll({
      getRoot: () => '/p',
      getView: () => view,
    })
    restoreScrollPercent('/p/a.md')
    expect((view.scrollDOM as unknown as { scrollTop: number }).scrollTop).toBe(0)
  })

  it('projectRoot 为空时 scheduleScrollSave 不写（静默）', () => {
    const { scheduleScrollSave } = useEditorScroll({
      getRoot: () => '',
      getView: () => null,
    })
    scheduleScrollSave('/p/a.md', 30)
    vi.advanceTimersByTime(600)
    expect(localStorage.length).toBe(0)
  })
})
