/**
 * 编辑器滚动位置持久化。
 *
 * 从 MdEditor.vue 下沉而来。原实现直接 `localStorage.getItem/setItem`，
 * 绕过 `core/storage.ts` 的安全访问层（环境守卫 + try/catch），且
 * `restoreScrollPercent` 里有一处不可达的重复空检查。
 *
 * 依赖规则：不闭包捕获组件的 `view` / `projectRoot` 变量，改由调用方通过
 * 回调注入，保证本模块可在 node 环境 + mock 下直接测试。
 */
import { ref } from 'vue'
import { readJson, writeJson } from '../../core/storage'

/** 每个项目的滚动位置 key：`editor-scroll:<projectRoot>` */
function scrollStoreKey(root: string): string {
  return 'editor-scroll:' + root
}

export interface EditorScrollDeps {
  /** 取当前项目根路径（可能为空） */
  getRoot: () => string
  /** 取当前编辑器 view（可能为 null） */
  getView: () => { scrollDOM: HTMLElement } | null
}

export function useEditorScroll(deps: EditorScrollDeps) {
  const scrollPercent = ref(0)
  let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null

  /** 读当前滚动百分比并写回 ref（供状态栏展示） */
  function readScrollPercent(): number {
    const view = deps.getView()
    if (!view) return 0
    const el = view.scrollDOM
    const max = el.scrollHeight - el.clientHeight
    const pct = max > 0 ? Math.round((el.scrollTop / max) * 100) : 0
    scrollPercent.value = pct
    return pct
  }

  /** 防抖持久化阅读位置（切文件/重启后恢复） */
  function scheduleScrollSave(path: string, percent: number) {
    if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
    scrollSaveTimer = setTimeout(() => {
      scrollSaveTimer = null
      const root = deps.getRoot()
      if (!root) return
      const key = scrollStoreKey(root)
      const map = readJson<Record<string, number>>(key, {})
      map[path] = Math.max(0, Math.min(100, percent))
      writeJson(key, map)
    }, 600)
  }

  /** 立刻记录当前滚动百分比（切文件/卸载前调用） */
  function captureCurrentScroll(path: string) {
    const view = deps.getView()
    if (!view) return
    const el = view.scrollDOM
    const max = el.scrollHeight - el.clientHeight
    if (max > 0) scheduleScrollSave(path, Math.round((el.scrollTop / max) * 100))
  }

  /** 恢复上次阅读位置（pct 为 0 不滚动，避免把新文件滚到顶又跳回去的闪烁） */
  function restoreScrollPercent(path: string | undefined) {
    const view = deps.getView()
    if (!view || !path) return
    const root = deps.getRoot()
    if (!root) return
    const map = readJson<Record<string, number>>(scrollStoreKey(root), {})
    const pct = map[path]
    if (typeof pct === 'number' && pct > 0) {
      const el = view.scrollDOM
      const max = el.scrollHeight - el.clientHeight
      if (max > 0) el.scrollTop = (pct / 100) * max
    }
  }

  return {
    scrollPercent,
    readScrollPercent,
    scheduleScrollSave,
    captureCurrentScroll,
    restoreScrollPercent,
  }
}
