/**
 * 划词菜单：选区跟踪与动作触发。
 *
 * 从 MdEditor.vue 下沉。选区状态由 selection store 持有；本模块负责：
 * - trackSelection：把编辑器当前选区写入共享 store（无选区则清空）
 * - runSelAction：把划词动作写入 store，由 AI 面板消费执行
 * - hideSelMenu：收起右键菜单
 *
 * `showSelMenu` 的「挂载后按实际尺寸回推边界」依赖 DOM ref（selBarEl），
 * 保留在组件里（任务书 §3 Step 4 的约定）。
 */
import { ref } from 'vue'
import type { EditorSelection, PendingSelectionAction } from '../../stores/selection'

export interface SelMenuItem {
  label: string
  prompt: string
  maxTokens?: number
}

export interface EditorSelectionDeps {
  /** 取当前 view（选区来源；null 时跳过） */
  getView: () => {
    state: {
      selection: { main: { empty: boolean; from: number; to: number } }
      doc: { sliceString(from: number, to: number): string }
    }
  } | null
  /** 当前文件路径（写入选区时用） */
  getPath: () => string
  /** 写入选区（selectionStore.setSelection） */
  setSelection: (path: string, from: number, to: number, text: string) => void
  /** 清空选区（selectionStore.clearSelection） */
  clearSelection: () => void
  /** 取当前选区（selectionStore.selection，可能为 null） */
  getSelection: () => EditorSelection | null
  /** 发起划词动作（selectionStore.requestAction） */
  requestAction: (payload: PendingSelectionAction) => void
  /** 查快捷动作（QUICK_ACTIONS.find） */
  findAction: (label: string) => SelMenuItem | undefined
  /** 取自定义提示词（settings.aiQuickPrompts） */
  getCustomPrompt: (label: string) => string | undefined
}

export function useEditorSelection(deps: EditorSelectionDeps) {
  const selBar = ref<{ left: number; top: number } | null>(null)
  const selMoreOpen = ref(false)

  /** 把当前选区写入共享 store（无选区则清空）；选区一旦变化就收起右键菜单 */
  function trackSelection() {
    const view = deps.getView()
    if (!view) return
    const sel = view.state.selection.main
    const text = sel.empty ? '' : view.state.doc.sliceString(sel.from, sel.to)
    if (text) deps.setSelection(deps.getPath(), sel.from, sel.to, text)
    else deps.clearSelection()
    hideSelMenu()
  }

  /** 收起右键菜单（选区变化/滚动/点击别处/Esc 时） */
  function hideSelMenu() {
    selBar.value = null
    selMoreOpen.value = false
  }

  /** 划词工具条动作：把动作写入 store，由 AI 面板消费执行 */
  function runSelAction(label: string) {
    selMoreOpen.value = false
    selBar.value = null
    const sel = deps.getSelection()
    const view = deps.getView()
    if (!sel || !view) return
    const action = deps.findAction(label)
    if (!action) return
    const prompt = deps.getCustomPrompt(label) || action.prompt
    deps.requestAction({ label, prompt, selection: sel, maxTokens: action.maxTokens })
  }

  return {
    selBar,
    selMoreOpen,
    trackSelection,
    hideSelMenu,
    runSelAction,
  }
}
