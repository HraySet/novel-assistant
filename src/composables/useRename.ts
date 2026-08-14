import { ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useFileStore } from '../stores/file'

export function useRename(nodePath: string, nodeName: string, isDir: boolean) {
  const fileStore = useFileStore()
  const { renamingPath } = storeToRefs(fileStore)

  const renameValue = ref(nodeName)
  const renameInputRef = ref<HTMLInputElement>()

  // Watch renamingPath to initialize the input when this node becomes the renaming target
  watch(renamingPath, (path) => {
    if (path === nodePath) {
      renameValue.value = nodeName
      nextTick(() => {
        const el = renameInputRef.value
        if (!el) return
        el.focus()
        if (!isDir) {
          const dot = nodeName.lastIndexOf('.')
          el.setSelectionRange(0, dot > 0 ? dot : nodeName.length)
        } else {
          el.select()
        }
      })
    }
  })

  function handleConfirm() {
    if (renamingPath.value !== nodePath) return
    fileStore.confirmRename(renameValue.value)
  }

  function handleCancel() {
    if (renamingPath.value !== nodePath) return
    fileStore.cancelRename()
  }

  return {
    renameValue,
    renameInputRef,
    handleConfirm,
    handleCancel,
  }
}
