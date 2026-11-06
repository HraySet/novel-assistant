// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEditorUndo } from '../useEditorUndo'

vi.mock('../../../api/files', () => ({
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  deleteFile: vi.fn(async () => undefined),
}))

import * as api from '../../../api/files'

/**
 * useEditorUndo 单元测试：锁定 T1 撤销命名改造的契约。
 * 1. 新命名 = .stats/undo/<encodeURIComponent(相对路径)>.json
 * 2. loadSavedState 读不到新名时回退旧名（绝对路径编码）并迁移（写新名 + 删旧名）
 */

function makeDeps<T>(overrides: Partial<Parameters<typeof useEditorUndo<T>>[0]> = {}) {
  return {
    getRoot: () => 'E:/书',
    getView: () => ({ state: { toJSON: () => ({ doc: 'x' }) } }),
    fromJSON: (saved: unknown) => saved as T,
    historyField: {},
    ...overrides,
  } as Parameters<typeof useEditorUndo<T>>[0]
}

describe('useEditorUndo 命名', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('undoFilePath 用相对路径 + encodeURIComponent 命名', () => {
    const { undoFilePath } = useEditorUndo(makeDeps())
    // 相对路径「第1章.md」→ encodeURIComponent 后「%E7%AC%AC1%E7%AB%A0.md」，再加 .json
    expect(undoFilePath('E:/书/第1章.md')).toBe(
      'E:/书/.stats/undo/%E7%AC%AC1%E7%AB%A0.md.json',
    )
  })

  it('projectRoot 为空时 undoFilePath 返回空串（静默）', () => {
    const { undoFilePath } = useEditorUndo(makeDeps({ getRoot: () => '' }))
    expect(undoFilePath('/x.md')).toBe('')
  })

  it('saveUndoHistory 序列化状态写入新命名文件', async () => {
    const toJSON = vi.fn(() => ({ doc: '正文', selection: {} }))
    const { saveUndoHistory } = useEditorUndo(
      makeDeps({ getView: () => ({ state: { toJSON } }) }),
    )
    saveUndoHistory('E:/书/第1章.md')
    await vi.waitFor(() => {
      expect(api.writeFile).toHaveBeenCalled()
    })
    const [file, json] = (api.writeFile as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(file).toBe('E:/书/.stats/undo/%E7%AC%AC1%E7%AB%A0.md.json')
    expect(JSON.parse(json).doc).toBe('正文')
  })

  it('loadSavedState 读新名成功时返回状态', async () => {
    vi.mocked(api.readFile).mockResolvedValueOnce(JSON.stringify({ doc: '正文' }))
    const { loadSavedState } = useEditorUndo<{ doc: string }>(makeDeps())
    const state = await loadSavedState('E:/书/第1章.md', '正文')
    expect(state).toEqual({ doc: '正文' })
  })

  it('loadSavedState 新名读不到时回退旧名并迁移', async () => {
    // 第一次 readFile（新名）抛错 → 触发回退
    vi.mocked(api.readFile)
      .mockRejectedValueOnce(new Error('不存在'))
      // 第二次 readFile（旧名）返回内容
      .mockResolvedValueOnce(JSON.stringify({ doc: '正文' }))
    const { loadSavedState } = useEditorUndo<{ doc: string }>(makeDeps())
    const state = await loadSavedState('E:/书/第1章.md', '正文')

    expect(state).toEqual({ doc: '正文' })
    // 迁移：写新名 + 删旧名
    expect(api.writeFile).toHaveBeenCalledWith(
      'E:/书/.stats/undo/%E7%AC%AC1%E7%AB%A0.md.json',
      JSON.stringify({ doc: '正文' }),
    )
    expect(api.deleteFile).toHaveBeenCalled()
  })

  it('loadSavedState 旧名内容与当前不一致时返回 null（不迁移）', async () => {
    vi.mocked(api.readFile)
      .mockRejectedValueOnce(new Error('不存在'))
      .mockResolvedValueOnce(JSON.stringify({ doc: '旧内容' }))
    const { loadSavedState } = useEditorUndo<{ doc: string }>(makeDeps())
    const state = await loadSavedState('E:/书/第1章.md', '新内容')
    expect(state).toBeNull()
    expect(api.writeFile).not.toHaveBeenCalled()
  })
})
