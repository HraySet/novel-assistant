import { ref } from 'vue'
import { useFileStore } from '../stores/file'

export function useFileTreeDrag() {
  const fileStore = useFileStore()
  const dragOver = ref(false)

  function normalizePath(path: string) {
    return path.replace(/\\/g, '/')
  }

  function getParentPath(path: string) {
    const normalized = normalizePath(path)
    return normalized.slice(0, normalized.lastIndexOf('/'))
  }

  function getDragSource(e: DragEvent) {
    return e.dataTransfer?.getData('text/plain') || fileStore.dragSource
  }

  function handleDragStart(e: DragEvent, nodePath: string) {
    if (!e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', nodePath)
    fileStore.setDragSource(nodePath)
  }

  function handleDragEnter(_e: DragEvent) {
    dragOver.value = true
  }

  function handleDragOver(e: DragEvent) {
    if (!e.dataTransfer) return
    // Chrome 在 dragover 阶段不允许 getData，改用 types 检查
    if (e.dataTransfer.types.includes('text/plain')) {
      e.dataTransfer.dropEffect = 'move'
      dragOver.value = true
    }
  }

  function handleDragLeave() {
    dragOver.value = false
  }

  function handleDragEnd() {
    dragOver.value = false
    fileStore.setDragSource(null)
  }

  async function handleDrop(e: DragEvent, destDir: string) {
    dragOver.value = false
    const sourcePath = getDragSource(e)
    fileStore.setDragSource(null)
    if (!sourcePath) return

    const source = normalizePath(sourcePath)
    const destination = normalizePath(destDir)
    if (source === destination || getParentPath(source) === destination || destination.startsWith(`${source}/`)) return

    try {
      fileStore.expandPath(destDir)
      await fileStore.handleDrop(sourcePath, destDir)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('移动失败:', e)
    }
  }

  return {
    dragOver,
    handleDragStart,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    handleDrop,
  }
}
