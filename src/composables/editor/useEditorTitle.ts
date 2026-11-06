/**
 * 章节标题 ↔ 文件名同步。
 *
 * 从 MdEditor.vue 下沉。标题即文件名（去掉扩展名）；提交标题 = 重命名文件。
 * `commitTitle` 依赖 fileStore.renamePath，通过 deps 注入，避免闭包捕获组件实例。
 */
import { ref } from 'vue'
import { sanitizeFileName } from '../../core/text'

/** 去掉 .md/.txt 扩展名得到显示标题 */
export function fileNameOf(name?: string): string {
  if (!name) return '未命名'
  return name.replace(/\.(md|txt)$/i, '')
}

export interface EditorTitleDeps {
  /** 当前文件名（含扩展名，可能为空） */
  getName: () => string | undefined
  /** 当前文件路径（可能为空） */
  getPath: () => string | undefined
  /** 标题输入框是否正在编辑（避免同步覆盖未提交草稿） */
  isEditing: () => boolean
  /** 执行重命名（fileStore.renamePath） */
  rename: (path: string, newName: string) => Promise<unknown>
}

export function useEditorTitle(deps: EditorTitleDeps) {
  const titleDraft = ref('')
  const titleSyncError = ref('')
  let titleErrorTimer: ReturnType<typeof setTimeout> | null = null

  /** 从文件名同步标题（去掉扩展名）；输入框正在编辑时不同步 */
  function syncTitleFromName() {
    if (deps.isEditing()) return
    titleDraft.value = fileNameOf(deps.getName())
  }

  /** 提交标题 = 重命名文件（保留原扩展名；不碰文档内容） */
  async function commitTitle(): Promise<void> {
    const path = deps.getPath()
    const name = deps.getName()
    if (!path || !name) return
    const fallback = fileNameOf(name)
    const finalTitle = sanitizeFileName(titleDraft.value.trim()) || fallback
    titleDraft.value = finalTitle
    if (finalTitle === fallback) return
    const ext = name.match(/\.(md|txt)$/i)?.[0] ?? '.md'
    const newName = finalTitle + ext
    if (newName === name) return
    titleSyncError.value = ''
    try {
      await deps.rename(path, newName)
    } catch (e) {
      console.error('重命名失败:', e)
      titleSyncError.value = e instanceof Error ? e.message : '重命名失败'
      if (titleErrorTimer) clearTimeout(titleErrorTimer)
      titleErrorTimer = setTimeout(() => { titleSyncError.value = '' }, 3000)
    }
  }

  function clearTitleErrorTimer() {
    if (titleErrorTimer) clearTimeout(titleErrorTimer)
  }

  return {
    titleDraft,
    titleSyncError,
    syncTitleFromName,
    commitTitle,
    clearTitleErrorTimer,
  }
}
