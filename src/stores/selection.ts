import { defineStore } from 'pinia'
import { ref } from 'vue'
import { countWords } from '../utils/countWords'

/** 编辑器划词选区（快照：文本 + 范围 + 字数） */
export interface EditorSelection {
  path: string
  from: number
  to: number
  text: string
  words: number
}

/** 编辑器划词工具条发起的 AI 动作：由 AI 面板消费执行 */
export interface PendingSelectionAction {
  label: string
  prompt: string
  selection: EditorSelection
}

/**
 * 划词联动状态：编辑器选区与侧栏快捷操作的实时桥。
 * - 编辑器选中文字时写入选区快照，侧栏据此启用/禁用依赖选区的操作；
 * - 工具条按钮把动作暂存为 pendingAction，侧栏面板消费后清空。
 */
export const useSelectionStore = defineStore('selection', () => {
  const selection = ref<EditorSelection | null>(null)
  const pendingAction = ref<PendingSelectionAction | null>(null)

  function setSelection(path: string, from: number, to: number, text: string) {
    selection.value = text.length > 0 ? { path, from, to, text, words: countWords(text) } : null
  }

  function clearSelection() {
    selection.value = null
  }

  /** 编辑器工具条触发：AI 面板消费后调用 consumePendingAction 清空 */
  function requestAction(action: PendingSelectionAction) {
    pendingAction.value = action
  }

  function consumePendingAction() {
    pendingAction.value = null
  }

  return { selection, pendingAction, setSelection, clearSelection, requestAction, consumePendingAction }
})
