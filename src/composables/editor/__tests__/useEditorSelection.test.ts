import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEditorSelection } from '../useEditorSelection'
import type { EditorSelection } from '../../../stores/selection'

/**
 * useEditorSelection 单元测试：选区跟踪与划词动作触发。
 */

function makeSel(overrides: Partial<EditorSelection> = {}): EditorSelection {
  return { path: '/p/a.md', from: 0, to: 3, text: 'abc', words: 3, ...overrides }
}

function makeDeps(overrides: Partial<Parameters<typeof useEditorSelection>[0]> = {}) {
  const setSelection = vi.fn()
  const clearSelection = vi.fn()
  const requestAction = vi.fn()
  let currentSel: EditorSelection | null = makeSel()
  return {
    setSelection,
    clearSelection,
    requestAction,
    getView: () => ({
      state: {
        selection: { main: { empty: false, from: 0, to: 3 } },
        doc: { sliceString: () => 'abc' },
      },
    }) as never,
    getPath: () => '/p/a.md',
    getSelection: () => currentSel,
    findAction: (label: string) => ({ label, prompt: 'prompt', maxTokens: 2000 }),
    getCustomPrompt: () => undefined,
    ...overrides,
  } as Parameters<typeof useEditorSelection>[0]
}

describe('useEditorSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('trackSelection 有选区时写入选区并收起菜单', () => {
    const deps = makeDeps()
    const { trackSelection, selBar } = useEditorSelection(deps)
    selBar.value = { left: 10, top: 10 }
    trackSelection()
    expect(deps.setSelection).toHaveBeenCalledWith('/p/a.md', 0, 3, 'abc')
    expect(selBar.value).toBeNull()
  })

  it('trackSelection 无选区时清空选区', () => {
    const deps = makeDeps({
      getView: () => ({
        state: {
          selection: { main: { empty: true, from: 0, to: 0 } },
          doc: { sliceString: () => '' },
        },
      }) as never,
    })
    const { trackSelection } = useEditorSelection(deps)
    trackSelection()
    expect(deps.clearSelection).toHaveBeenCalled()
  })

  it('runSelAction 写入动作（含 maxTokens）并收起菜单', () => {
    const deps = makeDeps()
    const { runSelAction, selMoreOpen, selBar } = useEditorSelection(deps)
    selMoreOpen.value = true
    selBar.value = { left: 1, top: 1 }
    runSelAction('润色')
    expect(deps.requestAction).toHaveBeenCalledWith({
      label: '润色',
      prompt: 'prompt',
      selection: expect.objectContaining({ text: 'abc' }),
      maxTokens: 2000,
    })
    expect(selMoreOpen.value).toBe(false)
    expect(selBar.value).toBeNull()
  })

  it('runSelAction 找不到动作时直接返回', () => {
    const deps = makeDeps({ findAction: () => undefined })
    const { runSelAction } = useEditorSelection(deps)
    runSelAction('不存在')
    expect(deps.requestAction).not.toHaveBeenCalled()
  })

  it('hideSelMenu 清空菜单与更多菜单', () => {
    const { hideSelMenu, selBar, selMoreOpen } = useEditorSelection(makeDeps())
    selBar.value = { left: 1, top: 1 }
    selMoreOpen.value = true
    hideSelMenu()
    expect(selBar.value).toBeNull()
    expect(selMoreOpen.value).toBe(false)
  })
})
