/**
 * AI 结果落地：把 AI 输出写进编辑器 / 替换划词选区。
 *
 * 从 App.vue 抽出（原先是三个散落的函数 + 一个 watch）。
 * 通过 getter 而不是 ref 传入编辑器，避免依赖组件类型与 ref 的型变问题。
 */
import { watch } from 'vue'
import { useFileStore } from '../stores/file'
import { useSelectionStore } from '../stores/selection'
import type { WriterEditorApi } from '../types/editor'

export interface SelectionTarget {
  path: string
  from: number
  to: number
  original?: string
}

export function useAiApply(opts: {
  /** 取当前编辑器实例（未挂载时返回 undefined） */
  getEditor: () => WriterEditorApi | undefined
  /** 划词工具的动作用户触发时，需要把 AI 面板打开 */
  onNeedPanel: () => void
}) {
  const fileStore = useFileStore()
  const selectionStore = useSelectionStore()

  /** 把文本插入编辑器光标处（重复内容会被编辑器自身跳过） */
  function insert(text: string): void {
    opts.getEditor()?.insertIfNotDuplicate(text)
  }

  /**
   * 把 AI 结果替换进编辑器划词选区。
   *
   * 两道校验缺一不可：
   * 1. 目标文件必须仍是当前文件（用户可能已切走）；
   * 2. 选区范围对应的原文必须没变（用户可能已手动修改）。
   */
  function applyToSelection(target: SelectionTarget, text: string): boolean {
    const editor = opts.getEditor()
    if (!editor) return false
    if (fileStore.openFile?.path !== target.path) return false
    const ok = editor.replaceRange(target.from, target.to, text, target.original)
    if (ok) void fileStore.handleSave()
    return ok
  }

  // 划词工具栏触发的动作需要面板在场才能被消费，这里负责把面板叫出来
  watch(
    () => selectionStore.pendingAction,
    (action) => {
      if (action) opts.onNeedPanel()
    },
  )

  return { insert, applyToSelection }
}
