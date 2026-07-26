import { nextTick, ref } from 'vue'

export function useFileTreeNodeInteractions() {
  const renaming = ref(false)
  const renameValue = ref('')
  const renameInputRef = ref<HTMLInputElement>()
  const dragOver = ref(false)
  let renameConfirmed = false

  function startRename(currentName: string, isDir: boolean) {
    renameConfirmed = false
    renameValue.value = currentName
    renaming.value = true

    nextTick(() => {
      const el = renameInputRef.value
      if (!el) return
      el.focus()
      if (!isDir) {
        const dot = currentName.lastIndexOf('.')
        el.setSelectionRange(0, dot > 0 ? dot : currentName.length)
      } else {
        el.select()
      }
    })
  }

  function confirmRename(currentName: string, onConfirm: (newName: string) => void) {
    if (renameConfirmed) return
    renameConfirmed = true
    renaming.value = false

    const trimmed = renameValue.value.trim()
    if (trimmed && trimmed !== currentName) {
      onConfirm(trimmed)
    }
  }

  function cancelRename() {
    renameConfirmed = true
    renaming.value = false
  }

  function handleDragStart(e: DragEvent, nodePath: string) {
    if (!e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', nodePath)
  }

  function handleDragOver(e: DragEvent) {
    if (!e.dataTransfer) return
    if (e.dataTransfer.types.includes('text/plain')) {
      e.dataTransfer.dropEffect = 'move'
      dragOver.value = true
    }
  }

  function handleDragLeave() {
    dragOver.value = false
  }

  function handleDrop(e: DragEvent, nodePath: string, onMove: (source: string, destDir: string) => void) {
    dragOver.value = false
    const sourcePath = e.dataTransfer?.getData('text/plain')
    if (!sourcePath || sourcePath === nodePath) return

    const separator = nodePath.includes('\\') ? '\\' : '/'
    if (sourcePath.startsWith(nodePath + separator) || sourcePath.startsWith(nodePath + '\\')) return

    onMove(sourcePath, nodePath)
  }

  return {
    renaming,
    renameValue,
    renameInputRef,
    dragOver,
    startRename,
    confirmRename,
    cancelRename,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
