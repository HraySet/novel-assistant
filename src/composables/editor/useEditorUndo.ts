/**
 * 撤销历史持久化（跨重启保留 Ctrl+Z）。
 *
 * 从 MdEditor.vue 下沉，是 T1（撤销命名改造）的消费端。
 *
 * 命名方案（与 core/paths 的 toRelativePath / undoFileName 一致）：
 * - 新命名：`.stats/undo/<encodeURIComponent(相对路径)>.json`
 * - 旧命名：`.stats/undo/<encodeURIComponent(绝对路径)>.json`（历史版本兼容）
 *
 * 磁盘迁移（重命名时把 undo 文件搬到新名）由 Rust 端 `migrate_undo_on_rename`
 * 统一负责，前端只做「读取时的旧名回退兼容」，避免双重 rename。
 *
 * 依赖规则：CodeMirror 的 EditorState / historyField / extensions 通过 deps 注入，
 * 本模块不 import CodeMirror，可在 node 环境 mock 测试。
 */
import * as api from '../../api/files'
import { toRelativePath, undoFileName } from '../../core/paths'

export interface EditorUndoDeps<T> {
  /** 当前项目根路径（可能为空） */
  getRoot: () => string
  /** 取当前 view（序列化撤销历史用；null 时不落盘） */
  getView: () => { state: { toJSON(o: unknown): unknown } } | null
  /** 从 JSON 反序列化出 EditorState（CodeMirror 的 EditorState.fromJSON） */
  fromJSON: (saved: unknown) => T
  /** 撤销历史字段（CodeMirror 的 historyField） */
  historyField: unknown
}

export function useEditorUndo<T>(deps: EditorUndoDeps<T>) {
  /** undo 目录：项目根下 .stats/undo（保持根路径分隔符风格） */
  function undoDir(): string {
    const root = deps.getRoot()
    if (!root) return ''
    const sep = root.includes('\\') ? '\\' : '/'
    return root + sep + '.stats' + sep + 'undo'
  }

  /** 新命名：相对项目根路径 + 固定 '/' 分隔符 → encodeURIComponent + .json */
  function undoFilePath(path: string): string {
    const root = deps.getRoot()
    if (!root) return ''
    const dir = undoDir()
    if (!dir) return ''
    const sep = root.includes('\\') ? '\\' : '/'
    return dir + sep + undoFileName(toRelativePath(root, path))
  }

  /** 旧命名（兼容历史版本）：encodeURIComponent(绝对路径) + .json */
  function legacyUndoFilePath(path: string): string {
    const root = deps.getRoot()
    if (!root) return ''
    const dir = undoDir()
    if (!dir) return ''
    const sep = root.includes('\\') ? '\\' : '/'
    return dir + sep + encodeURIComponent(path) + '.json'
  }

  /** 序列化当前状态（含 doc、选区、撤销历史）写入 .stats/undo/ */
  function saveUndoHistory(path: string) {
    const view = deps.getView()
    if (!view || !path) return
    try {
      const file = undoFilePath(path)
      if (!file) return
      const json = view.state.toJSON({ history: deps.historyField })
      api.writeFile(file, JSON.stringify(json)).catch(() => { /* 保存失败不阻塞 */ })
    } catch { /* 序列化失败忽略 */ }
  }

  /** 读取撤销历史：doc 与当前内容一致才恢复（位置才有效） */
  async function loadSavedState(path: string | undefined, content: string): Promise<T | null> {
    if (!path) return null
    try {
      const file = undoFilePath(path)
      if (!file) return null
      const raw = await api.readFile(file)
      const saved = JSON.parse(raw)
      if (!saved || saved.doc !== content) return null
      return deps.fromJSON(saved)
    } catch {
      // 新命名读不到 → 回退旧命名（绝对路径编码）读一次，成功则迁移到新命名。
      // 时序约束：旧名拼接依赖 projectRoot 就绪；projectRoot 为空时 undoFilePath/legacy 均返回空，
      // 此时无法回退，直接返回 null（静默，不报错）。
      return await migrateFromLegacyUndo(path, content)
    }
  }

  /** 旧命名回退迁移：读旧名 → 成功则写新名、删旧文件 */
  async function migrateFromLegacyUndo(path: string, content: string): Promise<T | null> {
    const root = deps.getRoot()
    if (!root) return null
    try {
      const legacyFile = legacyUndoFilePath(path)
      if (!legacyFile) return null
      // 旧名与新名相同则无需迁移（理论上 encodeURIComponent(绝对路径) 与相对路径不会相同，仅防御）
      const newFile = undoFilePath(path)
      if (legacyFile === newFile) return null
      const raw = await api.readFile(legacyFile)
      const saved = JSON.parse(raw)
      if (!saved || saved.doc !== content) return null
      const state = deps.fromJSON(saved)
      // 迁移：写新名，删旧文件（失败不阻塞，下次仍可回退重试）
      api.writeFile(newFile, raw).catch(() => {})
      api.deleteFile(legacyFile).catch(() => {})
      return state
    } catch {
      return null
    }
  }

  /** 应用关闭前落盘撤销历史（App 关闭守卫调用） */
  function flushUndo(path: string | undefined) {
    if (path) saveUndoHistory(path)
  }

  return {
    undoFilePath,
    saveUndoHistory,
    loadSavedState,
    flushUndo,
  }
}
