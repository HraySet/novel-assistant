import { storeToRefs } from 'pinia'
import { useFileStore } from '../stores/file'

export function useContextMenu() {
  const fileStore = useFileStore()
  const { contextMenu } = storeToRefs(fileStore)

  return {
    contextMenu,
    openMenu: fileStore.openContextMenu,
    closeMenu: fileStore.closeContextMenu,
  }
}
