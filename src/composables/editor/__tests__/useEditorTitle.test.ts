import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fileNameOf, useEditorTitle } from '../useEditorTitle'

describe('fileNameOf', () => {
  it('去掉 .md/.txt 扩展名', () => {
    expect(fileNameOf('第1章.md')).toBe('第1章')
    expect(fileNameOf('第1章.txt')).toBe('第1章')
    expect(fileNameOf('第1章.MD')).toBe('第1章')
  })

  it('空名返回「未命名」', () => {
    expect(fileNameOf()).toBe('未命名')
    expect(fileNameOf(undefined)).toBe('未命名')
  })
})

describe('useEditorTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  function makeDeps(overrides: Partial<Parameters<typeof useEditorTitle>[0]> = {}) {
    return {
      getName: () => '第1章.md',
      getPath: () => '/p/第1章.md',
      isEditing: () => false,
      rename: vi.fn(async () => undefined),
      ...overrides,
    }
  }

  it('syncTitleFromName 从文件名同步标题', () => {
    const deps = makeDeps()
    const { titleDraft, syncTitleFromName } = useEditorTitle(deps)
    syncTitleFromName()
    expect(titleDraft.value).toBe('第1章')
  })

  it('输入框正在编辑时不同步', () => {
    const deps = makeDeps({ isEditing: () => true })
    const { titleDraft, syncTitleFromName } = useEditorTitle(deps)
    titleDraft.value = '草稿'
    syncTitleFromName()
    expect(titleDraft.value).toBe('草稿') // 未被覆盖
  })

  it('commitTitle 标题不变时不重命名', async () => {
    const rename = vi.fn(async () => undefined)
    const deps = makeDeps({ rename })
    const { titleDraft, syncTitleFromName, commitTitle } = useEditorTitle(deps)
    syncTitleFromName()
    await commitTitle()
    expect(rename).not.toHaveBeenCalled()
  })

  it('commitTitle 标题变化时保留扩展名并重命名', async () => {
    const rename = vi.fn(async () => undefined)
    const deps = makeDeps({ rename })
    const { titleDraft, commitTitle } = useEditorTitle(deps)
    titleDraft.value = '第一章 新的开始'
    await commitTitle()
    expect(rename).toHaveBeenCalledWith('/p/第1章.md', '第一章 新的开始.md')
  })

  it('commitTitle 重命名失败时设置错误并 3 秒后清除', async () => {
    const rename = vi.fn(async () => { throw new Error('路径超出项目') })
    const deps = makeDeps({ rename })
    const { titleDraft, titleSyncError, commitTitle } = useEditorTitle(deps)
    titleDraft.value = '新名字'
    await commitTitle()
    expect(titleSyncError.value).toBe('路径超出项目')
    vi.advanceTimersByTime(3000)
    expect(titleSyncError.value).toBe('')
  })
})
